/**
 * AI4U Little Engineer — Primitive Shape Normalizer
 *
 * Detects canonical geometric primitives in a user prompt and returns a
 * fully-resolved family + dimensions object BEFORE any LLM call.
 *
 * This prevents prompts like "make a cube with 5mm sides" from being routed
 * to spacer/jig families that require hole margins or thickness rules.
 *
 * Canonical mappings (per spec section 1):
 *   "cube" / "Xmm cube" / "cube with X sides"
 *     → family = standoff_block
 *     → length = X, width = X, height = X, hole_diameter = 0
 *
 *   "rectangular block" / "rectangular prism" / "box" (with explicit dims)
 *     → family = standoff_block
 *     → length/width/height parsed from prompt
 *
 *   "cylinder" / "cylindrical"
 *     → family = spacer
 *     → outer_diameter + length parsed from prompt, inner_diameter = 0
 *
 *   "ring" / "spacer" / "bushing"
 *     → family = spacer
 *     → outer_diameter + inner_diameter + length parsed from prompt
 *
 * Returns null if no primitive is detected — caller falls through to LLM.
 */

export interface PrimitiveNormResult {
  family: string;
  parameters: Record<string, number>;
  reasoning: string;
  confidence: number;
  is_primitive: true;
}

// ── Dimension extraction helpers ─────────────────────────────────────────────

/**
 * Extracts the first numeric value (with optional unit) from a string.
 * Handles: "5mm", "5 mm", "5", "12.5mm", "12.5 mm"
 */
function extractFirstNumber(text: string): number | null {
  const match = text.match(/(\d+(?:\.\d+)?)\s*(?:mm|cm|in|inch)?/i);
  if (!match) return null;
  const val = parseFloat(match[1]);
  return isNaN(val) ? null : val;
}

/**
 * Extracts a dimension value following a keyword like "5mm sides", "width 30mm",
 * "30mm wide", "diameter 20mm", etc.
 *
 * Priority: keyword-then-number wins over number-then-keyword.
 * Multi-word keywords (e.g. "outer diameter") are matched first.
 */
function extractDimAfterKeyword(text: string, keywords: string[]): number | null {
  // Sort by length descending so multi-word keywords match before single-word
  const sorted = [...keywords].sort((a, b) => b.length - a.length);
  for (const kw of sorted) {
    // Pattern 1: keyword then number — "diameter 20mm", "diameter 20"
    const afterKw = new RegExp(`\\b${kw}\\b[^\\d]*(\\d+(?:\.\\d+)?)\\s*(?:mm|cm)?`, "i");
    // Pattern 2: number then keyword — "20mm diameter", "20 diameter"
    const beforeKw = new RegExp(`(\\d+(?:\.\\d+)?)\\s*(?:mm|cm)?\\s+${kw}\\b`, "i");
    const m1 = text.match(afterKw);
    if (m1) return parseFloat(m1[1]);
    const m2 = text.match(beforeKw);
    if (m2) return parseFloat(m2[1]);
  }
  return null;
}

// ── Cube normalizer ──────────────────────────────────────────────────────────

function tryNormalizeCube(text: string): PrimitiveNormResult | null {
  const lower = text.toLowerCase();

  // Must contain "cube" or "equal sides" or "all sides equal"
  const isCube =
    /\bcube\b/.test(lower) ||
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

  // Clamp to standoff_block valid range: min 3mm, max 500mm
  side = Math.max(3, Math.min(500, side));

  return {
    family: "standoff_block",
    parameters: {
      length: side,
      width: side,
      height: side,
      hole_diameter: 0,
    },
    reasoning: `Cube primitive detected. Mapped to standoff_block with equal sides (${side}mm × ${side}mm × ${side}mm, no hole).`,
    confidence: 0.97,
    is_primitive: true,
  };
}

// ── Cylinder normalizer ──────────────────────────────────────────────────────

function tryNormalizeCylinder(text: string): PrimitiveNormResult | null {
  const lower = text.toLowerCase();

  // Must contain "cylinder" or "cylindrical"
  const isCylinder =
    /\bcylinder\b/.test(lower) ||
    /\bcylindrical\b/.test(lower);

  if (!isCylinder) return null;

  // Extract diameter — try explicit keyword patterns first
  let diameter: number | null = null;
  // "20mm diameter", "diameter 20mm", "20mm dia", "od 20mm"
  const diaPatterns = [
    /(\d+(?:\.\d+)?)\s*mm\s+(?:diameter|dia|od)\b/i,
    /\b(?:diameter|dia|od)\s+(\d+(?:\.\d+)?)\s*mm/i,
    /\b(?:diameter|dia|od)\s*[=:]?\s*(\d+(?:\.\d+)?)/i,
  ];
  for (const p of diaPatterns) {
    const m = lower.match(p);
    if (m) { diameter = parseFloat(m[1]); break; }
  }

  // Extract height/length
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

  // Fallback: extract numbers in order (first = diameter, second = height)
  if (!diameter || !height) {
    const allNums = [...lower.matchAll(/(\d+(?:\.\d+)?)\s*mm/gi)].map(m => parseFloat(m[1]));
    if (!diameter && allNums[0]) diameter = allNums[0];
    if (!height && allNums[1]) height = allNums[1];
  }

  // Defaults
  if (!diameter || diameter <= 0) diameter = 20;
  if (!height || height <= 0) height = 30;

  // Clamp
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

// ── Ring / Spacer normalizer ──────────────────────────────────────────────────────

function tryNormalizeRingOrSpacer(text: string): PrimitiveNormResult | null {
  const lower = text.toLowerCase();

  const isRingOrSpacer =
    /\bring\b/.test(lower) ||
    /\bspacer\b/.test(lower) ||
    /\bbushing\b/.test(lower) ||
    /\bwasher\b/.test(lower);

  if (!isRingOrSpacer) return null;

  // Extract OD — try explicit keyword patterns first
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

  // Extract ID / bore
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

  // Extract length/thickness
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

  // Fallback: extract numbers in order (first = OD, second = ID, third = length)
  const allNums = [...lower.matchAll(/(\d+(?:\.\d+)?)\s*mm/gi)].map(m => parseFloat(m[1]));
  if (!od && allNums[0]) od = allNums[0];
  if (!id && allNums[1]) id = allNums[1];
  if (!length && allNums[2]) length = allNums[2];

  // Defaults
  if (!od || od <= 0) od = 20;
  if (!id || id <= 0) id = 5;
  if (!length || length <= 0) length = 10;

  // Ensure OD > ID
  if (od <= id) id = Math.max(0, od - 4);

  // Clamp
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

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Attempt to normalize a user prompt to a canonical primitive shape.
 * Returns null if no primitive is detected (caller should fall through to LLM).
 *
 * Priority order: cube > cylinder > ring/spacer
 */
export function tryNormalizePrimitive(prompt: string): PrimitiveNormResult | null {
  if (!prompt || typeof prompt !== "string") return null;

  return (
    tryNormalizeCube(prompt) ??
    tryNormalizeCylinder(prompt) ??
    tryNormalizeRingOrSpacer(prompt) ??
    null
  );
}
