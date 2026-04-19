/**
 * Standalone test for primitive-normalizer logic.
 * Mirrors the TypeScript logic inline (no TS transpilation needed).
 */

function extractFirstNumber(text) {
  const match = text.match(/(\d+(?:\.\d+)?)\s*(?:mm|cm|in|inch)?/i);
  if (!match) return null;
  const val = parseFloat(match[1]);
  return isNaN(val) ? null : val;
}

function tryNormalizeCube(text) {
  const lower = text.toLowerCase();
  const isCube =
    /\bcube\b/.test(lower) ||
    /solid\s+cube/.test(lower) ||
    /solid\s+block/.test(lower) ||
    /block\s+with\s+equal\s+sides/.test(lower) ||
    /equal\s+sides/.test(lower);

  if (!isCube) return null;

  let side = null;
  const mmCube = lower.match(/(\d+(?:\.\d+)?)\s*mm\s+cube/i);
  if (mmCube) side = parseFloat(mmCube[1]);
  if (!side) {
    const withSides = lower.match(/cube\s+with\s+(\d+(?:\.\d+)?)\s*(?:mm)?\s+sides?/i);
    if (withSides) side = parseFloat(withSides[1]);
  }
  if (!side) {
    const sidesOf = lower.match(/sides?\s+of\s+(\d+(?:\.\d+)?)\s*(?:mm)?/i);
    if (sidesOf) side = parseFloat(sidesOf[1]);
  }
  if (!side) {
    const perSide = lower.match(/(\d+(?:\.\d+)?)\s*mm\s+(?:on\s+each|per)\s+side/i);
    if (perSide) side = parseFloat(perSide[1]);
  }
  if (!side) side = extractFirstNumber(lower);
  if (!side || side <= 0) side = 20;
  side = Math.max(1, Math.min(500, side));

  return {
    family: "solid_block",
    parameters: { length: side, width: side, height: side },
    reasoning: `Cube → solid_block (no hole), ${side}mm³`,
    confidence: 0.97,
    is_primitive: true,
  };
}

function tryNormalizeStandoff(text) {
  const lower = text.toLowerCase();
  const isStandoff =
    /\bstandoff\b/.test(lower) ||
    /\briser\b/.test(lower) ||
    /\bpcb\s+standoff\b/.test(lower) ||
    /\bholed\s+block\b/.test(lower) ||
    /\bblock\s+with\s+(?:a\s+)?hole\b/.test(lower);
  if (!isStandoff) return null;
  return {
    family: "standoff_block",
    parameters: { base_width: 20, height: 20, hole_diameter: 3.2 },
    reasoning: "Standoff → standoff_block",
    confidence: 0.92,
    is_primitive: true,
  };
}

function tryNormalizeCylinder(text) {
  const lower = text.toLowerCase();
  if (!/\bcylinder\b/.test(lower) && !/\bcylindrical\b/.test(lower)) return null;
  const allNums = [...lower.matchAll(/(\d+(?:\.\d+)?)\s*mm/gi)].map(m => parseFloat(m[1]));
  const diameter = allNums[0] ?? 20;
  const height = allNums[1] ?? 30;
  return {
    family: "spacer",
    parameters: { outer_diameter: diameter, inner_diameter: 0, length: height },
    reasoning: `Cylinder → spacer OD=${diameter} L=${height}`,
    confidence: 0.95,
    is_primitive: true,
  };
}

function tryNormalizePrimitive(prompt) {
  if (!prompt) return null;
  return tryNormalizeCube(prompt) ?? tryNormalizeStandoff(prompt) ?? tryNormalizeCylinder(prompt) ?? null;
}

// ── Tests ────────────────────────────────────────────────────────────────────
const tests = [
  {
    name: "Journey A — cube 5mm (full prompt)",
    prompt: "Make a cube with 5mm sides. Don't ask for clarification. Just make a cube.",
    expect_family: "solid_block",
    expect_no_hole: true,
    expect_dims: { length: 5, width: 5, height: 5 },
  },
  {
    name: "cube_5mm short",
    prompt: "5mm cube",
    expect_family: "solid_block",
    expect_no_hole: true,
    expect_dims: { length: 5, width: 5, height: 5 },
  },
  {
    name: "solid cube 20mm",
    prompt: "make a 20mm solid cube",
    expect_family: "solid_block",
    expect_no_hole: true,
    expect_dims: { length: 20, width: 20, height: 20 },
  },
  {
    name: "cube with sides of 10mm",
    prompt: "cube with sides of 10mm",
    expect_family: "solid_block",
    expect_no_hole: true,
    expect_dims: { length: 10, width: 10, height: 10 },
  },
  {
    name: "cylinder",
    prompt: "make a cylinder 20mm diameter 30mm tall",
    expect_family: "spacer",
    expect_no_hole: false,
  },
  {
    name: "standoff explicit",
    prompt: "make a standoff 20mm tall with a 3mm hole",
    expect_family: "standoff_block",
    expect_no_hole: false,
  },
  {
    name: "no match — bracket",
    prompt: "make a bracket to hold my monitor",
    expect_family: null,
    expect_no_hole: false,
  },
];

let allPass = true;
for (const t of tests) {
  const result = tryNormalizePrimitive(t.prompt);
  const actualFamily = result?.family ?? null;
  const hasHole = result ? ("hole_diameter" in (result.parameters ?? {})) && result.parameters.hole_diameter > 0 : false;

  let pass = actualFamily === t.expect_family;
  if (t.expect_no_hole && hasHole) pass = false;
  if (t.expect_dims && result) {
    for (const [k, v] of Object.entries(t.expect_dims)) {
      if (result.parameters[k] !== v) { pass = false; break; }
    }
  }

  const icon = pass ? "✅" : "❌";
  console.log(`${icon} ${t.name}`);
  console.log(`   prompt:   "${t.prompt}"`);
  console.log(`   expected: family=${t.expect_family}, no_hole=${t.expect_no_hole}`);
  console.log(`   got:      family=${actualFamily}, has_hole=${hasHole}, params=${JSON.stringify(result?.parameters ?? null)}`);
  if (!pass) allPass = false;
}

console.log("");
console.log(allPass ? "✅ ALL TESTS PASS" : "❌ SOME TESTS FAILED");
process.exit(allPass ? 0 : 1);
