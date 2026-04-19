/**
 * AI4U Little Engineer — Primitive Shape Normalizer
 *
 * Detects canonical geometric primitives in a user prompt and returns a
 * fully-resolved family + dimensions object BEFORE any LLM call.
 *
 * This prevents prompts like "make a cube with 5mm sides" from being routed
 * to spacer/jig/standoff families that require holes or other constraints.
 *
 * Canonical mappings:
 *
 *   "cube" / "Xmm cube" / "cube with X sides" / "solid cube"
 *     → family = solid_block
 *     → length = X, width = X, height = X
 *     NO HOLE. A cube is a solid block.
 *
 *   "rectangular block" / "rectangular prism" / "box" (with explicit dims)
 *     → family = solid_block
 *     → length/width/height parsed from prompt
 *
 *   "cylinder" / "cylindrical"
 *     → family = spacer
 *     → outer_diameter + length parsed from prompt, inner_diameter = 0
 *
 *   "ring" / "spacer" / "bushing" / "washer"
 *     → family = spacer
 *     → outer_diameter + inner_diameter + length parsed from prompt
 *
 *   "standoff" / "riser" / "pcb standoff" / "holed block"
 *     → family = standoff_block
 *     → base_width + height + hole_diameter parsed from prompt
 *
 * Returns null if no primitive is detected — caller falls through to LLM.
 *
 * IMPORTANT: cube/block prompts MUST NOT be routed to standoff_block.
 * standoff_block requires a through-hole; a cube does not.
 */

export interface PrimitiveNormResult {
  family: string;
  parameters: Record<string, number>;
  reasoning: string;
  confidence: number;
  is_primitive: true;
}

// ── Dimension extraction helpers ─────────────────────────────────────────────

function extractFirstNumber(text: string): number | null {
  const match = text.match(/(\d+(?:\.\d+)?)\s*(?:mm|cm|in|inch)?/i);
  if (!match) return null;
  const val = parseFloat(match[1]);
  return isNaN(val) ? null : val;
}

function extractDimAfterKeyword(text: string, keywords: string[]): number | null {
  const sorted = [...keywords].sort((a, b) => b.length - a.length);
  for (const kw of sorted) {
    const afterKw = new RegExp(`\\b${kw}\\b[^\\d]*(\\d+(?:\\.\\d+)?)\\s*(?:mm|cm)?`, "i");
    const beforeKw = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(?:mm|cm)?\\s+${kw}\\b`, "i");
    const m1 = text.match(afterKw);
    if (m1) return parseFloat(m1[1]);
    const m2 = text.match(beforeKw);
    if (m2) return parseFloat(m2[1]);
  }
  return null;
}

// ── Cube / solid block normalizer ─────────────────────────────────────────────

function tryNormalizeCube(text: string): PrimitiveNormResult | null {
  const lower = text.toLowerCase();

  // Must contain "cube", "solid cube", "solid block", or "equal sides"
  const isCube =
    /\bcube\b/.test(lower) ||
    /solid\s+cube/.test(lower) ||
    /solid\s+block/.test(lower) ||
    /block\s+with\s+equal\s+sides/.test(lower) ||
    /equal\s+sides/.test(lower);

  if (!isCube) return null;

  // Extract side length — try several patterns
  let side: number | null = null;

  // "5mm cube", "5 mm cube"
  const mmCube = lower.match(/(\d+(?:\.\d+)?)\s*mm\s+cube/i);
  if (mmCube) side = parseFloat(mmCube[1]);

  // "cube with 5mm sides", "cube with 5 mm side"
  if (!side) {
    const withSides = lower.match(/cube\s+with\s+(\d+(?:\.\d+)?)\s*(?:mm)?\s+sides?/i);
    if (withSides) side = parseFloat(withSides[1]);
  }

  // "cube with sides of 5mm"
  if (!side) {
    const sidesOf = lower.match(/sides?\s+of\s+(\d+(?:\.\d+)?)\s*(?:mm)?/i);
    if (sidesOf) side = parseFloat(sidesOf[1]);
  }

  // "5mm on each side", "5mm per side"
  if (!side) {
    const perSide = lower.match(/(\d+(?:\.\d+)?)\s*mm\s+(?:on\s+each|per)\s+side/i);
    if (perSide) side = parseFloat(perSide[1]);
  }

  // Fallback: first number in the string
  if (!side) side = extractFirstNumber(lower);

  // Default to 20mm if no size found
  if (!side || side <= 0) side = 20;

  // Clamp to solid_block valid range: min 1mm, max 500mm
  side = Math.max(1, Math.min(500, side));

  return {
    family: "solid_block",
    parameters: {
      length: side,
      width: side,
      height: side,
    },
    reasoning: `Cube primitive detected. Mapped to solid_block (true solid, no hole) with equal sides: ${side}mm × ${side}mm × ${side}mm.`,
    confidence: 0.97,
    is_primitive: true,
  };
}

// ── Rectangular block normalizer ─────────────────────────────────────────────

function tryNormalizeRectBlock(text: string): PrimitiveNormResult | null {
  const lower = text.toLowerCase();

  // Must contain "rectangular block", "rectangular prism", or "box" with explicit dims
  const isRect =
    /rectangular\s+(?:block|prism|box)/.test(lower) ||
    /solid\s+(?:rectangular|rect)\s+block/.test(lower);

  if (!isRect) return null;

  const length = extractDimAfterKeyword(lower, ["length", "long", "l"]) ?? extractFirstNumber(lower) ?? 20;
  const width = extractDimAfterKeyword(lower, ["width", "wide", "w"]) ?? length;
  const height = extractDimAfterKeyword(lower, ["height", "tall", "high", "h"]) ?? length;

  const l = Math.max(1, Math.min(500, length));
  const w = Math.max(1, Math.min(500, width));
  const h = Math.max(1, Math.min(500, height));

  return {
    family: "solid_block",
    parameters: { length: l, width: w, height: h },
    reasoning: `Rectangular block primitive detected. Mapped to solid_block (true solid, no hole): ${l}mm × ${w}mm × ${h}mm.`,
    confidence: 0.93,
    is_primitive: true,
  };
}

// ── Cylinder normalizer ──────────────────────────────────────────────────────

function tryNormalizeCylinder(text: string): PrimitiveNormResult | null {
  const lower = text.toLowerCase();

  const isCylinder =
    /\bcylinder\b/.test(lower) ||
    /\bcylindrical\b/.test(lower);

  if (!isCylinder) return null;

  let diameter: number | null = null;
  const diaPatterns = [
    /(\d+(?:\.\d+)?)\s*mm\s+(?:diameter|dia|od)\b/i,
    /\b(?:diameter|dia|od)\s+(\d+(?:\.\d+)?)\s*mm/i,
    /\b(?:diameter|dia|od)\s*[=:]?\s*(\d+(?:\.\d+)?)/i,
  ];
  for (const p of diaPatterns) {
    const m = lower.match(p);
    if (m) { diameter = parseFloat(m[1]); break; }
  }

  let height: number | null = null;
  const heightPatterns = [
    /(\d+(?:\.\d+)?)\s*mm\s+(?:tall|high|height|long|length)\b/i,
    /\b(?:tall|high|height|long|length)\s+(\d+(?:\.\d+)?)\s*mm/i,
    /\b(?:tall|high|height|long|length)\s*[=:]?\s*(\d+(?:\.\d+)?)/i,
  ];
  for (const p of heightPatterns) {
    const m = lower.match(p);
    if (m) { height = parseFloat(m[1]); break; }
  }

  if (!diameter || !height) {
    const allNums = [...lower.matchAll(/(\d+(?:\.\d+)?)\s*mm/gi)].map(m => parseFloat(m[1]));
    if (!diameter && allNums[0]) diameter = allNums[0];
    if (!height && allNums[1]) height = allNums[1];
  }

  if (!diameter || diameter <= 0) diameter = 20;
  if (!height || height <= 0) height = 30;

  diameter = Math.max(2, Math.min(500, diameter));
  height = Math.max(2, Math.min(500, height));

  return {
    family: "spacer",
    parameters: {
      outer_diameter: diameter,
      inner_diameter: 0,
      length: height,
    },
    reasoning: `Cylinder primitive detected. Mapped to spacer (solid cylinder) with OD=${diameter}mm, length=${height}mm, inner_diameter=0 (solid).`,
    confidence: 0.95,
    is_primitive: true,
  };
}

// ── Ring / Spacer normalizer ──────────────────────────────────────────────────

function tryNormalizeRingOrSpacer(text: string): PrimitiveNormResult | null {
  const lower = text.toLowerCase();

  const isRingOrSpacer =
    /\bring\b/.test(lower) ||
    /\bspacer\b/.test(lower) ||
    /\bbushing\b/.test(lower) ||
    /\bwasher\b/.test(lower);

  if (!isRingOrSpacer) return null;

  let od: number | null = null;
  const odPatterns = [
    /(\d+(?:\.\d+)?)\s*mm\s+(?:outer\s+diameter|od|outside\s+diameter)\b/i,
    /\b(?:outer\s+diameter|outside\s+diameter|od)\s+(\d+(?:\.\d+)?)\s*mm/i,
    /\b(?:outer\s+diameter|outside\s+diameter|od)\s*[=:]?\s*(\d+(?:\.\d+)?)/i,
  ];
  for (const p of odPatterns) {
    const m = lower.match(p);
    if (m) { od = parseFloat(m[1]); break; }
  }

  let id: number | null = null;
  const idPatterns = [
    /(\d+(?:\.\d+)?)\s*mm\s+(?:inner\s+diameter|id|inside\s+diameter|bore|hole)\b/i,
    /\b(?:inner\s+diameter|inside\s+diameter|id|bore|hole)\s+(\d+(?:\.\d+)?)\s*mm/i,
    /\b(?:inner\s+diameter|inside\s+diameter|id|bore|hole)\s*[=:]?\s*(\d+(?:\.\d+)?)/i,
  ];
  for (const p of idPatterns) {
    const m = lower.match(p);
    if (m) { id = parseFloat(m[1]); break; }
  }

  let length: number | null = null;
  const lenPatterns = [
    /(\d+(?:\.\d+)?)\s*mm\s+(?:thick|thickness|length|height|tall)\b/i,
    /\b(?:thick|thickness|length|height|tall)\s+(\d+(?:\.\d+)?)\s*mm/i,
    /\b(?:thick|thickness|length|height|tall)\s*[=:]?\s*(\d+(?:\.\d+)?)/i,
  ];
  for (const p of lenPatterns) {
    const m = lower.match(p);
    if (m) { length = parseFloat(m[1]); break; }
  }

  const allNums = [...lower.matchAll(/(\d+(?:\.\d+)?)\s*mm/gi)].map(m => parseFloat(m[1]));
  if (!od && allNums[0]) od = allNums[0];
  if (!id && allNums[1]) id = allNums[1];
  if (!length && allNums[2]) length = allNums[2];

  if (!od || od <= 0) od = 20;
  if (!id || id <= 0) id = 5;
  if (!length || length <= 0) length = 10;

  if (od <= id) id = Math.max(0, od - 4);

  od = Math.max(4, Math.min(500, od));
  id = Math.max(0, Math.min(od - 2, id));
  length = Math.max(1, Math.min(500, length));

  return {
    family: "spacer",
    parameters: {
      outer_diameter: od,
      inner_diameter: id,
      length,
    },
    reasoning: `Ring/spacer primitive detected. Mapped to spacer with OD=${od}mm, ID=${id}mm, length=${length}mm.`,
    confidence: 0.93,
    is_primitive: true,
  };
}

// ── Standoff normalizer ───────────────────────────────────────────────────────

function tryNormalizeStandoff(text: string): PrimitiveNormResult | null {
  const lower = text.toLowerCase();

  // Must explicitly mention standoff, riser, or pcb standoff
  const isStandoff =
    /\bstandoff\b/.test(lower) ||
    /\briser\b/.test(lower) ||
    /\bpcb\s+standoff\b/.test(lower) ||
    /\bholed\s+block\b/.test(lower) ||
    /\bblock\s+with\s+(?:a\s+)?hole\b/.test(lower);

  if (!isStandoff) return null;

  const baseWidth = extractDimAfterKeyword(lower, ["base", "base_width", "width", "wide"]) ?? extractFirstNumber(lower) ?? 20;
  const height = extractDimAfterKeyword(lower, ["height", "tall", "high", "length", "long"]) ?? 15;
  const holeDia = extractDimAfterKeyword(lower, ["hole", "bore", "diameter", "dia"]) ?? 3.2;

  const bw = Math.max(5, Math.min(500, baseWidth));
  const h = Math.max(3, Math.min(500, height));
  // hole_diameter must be >= 1.5mm and < (base_width - 2.0)mm
  const hd = Math.max(1.5, Math.min(bw - 2.5, holeDia));

  return {
    family: "standoff_block",
    parameters: {
      base_width: bw,
      height: h,
      hole_diameter: hd,
    },
    reasoning: `Standoff primitive detected. Mapped to standoff_block with base_width=${bw}mm, height=${h}mm, hole_diameter=${hd}mm.`,
    confidence: 0.92,
    is_primitive: true,
  };
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Attempt to normalize a user prompt to a canonical primitive shape.
 * Returns null if no primitive is detected (caller should fall through to LLM).
 *
 * Priority order: cube > rect_block > standoff > cylinder > ring/spacer
 *
 * IMPORTANT: cube/block prompts route to solid_block (no hole).
 * standoff prompts route to standoff_block (requires hole).
 * These are DIFFERENT families and must never be conflated.
 */
export function tryNormalizePrimitive(prompt: string): PrimitiveNormResult | null {
  if (!prompt || typeof prompt !== "string") return null;

  return (
    tryNormalizeCube(prompt) ??
    tryNormalizeRectBlock(prompt) ??
    tryNormalizeStandoff(prompt) ??
    tryNormalizeCylinder(prompt) ??
    tryNormalizeRingOrSpacer(prompt) ??
    null
  );
}
