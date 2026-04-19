/**
 * Quick unit test for the primitive shape normalizer logic.
 * Run with: node scripts/test-primitive-normalizer.mjs
 */

// ── Inline the normalizer logic (mirrors primitive-normalizer.ts) ─────────────

function extractFirstNumber(text) {
  const match = text.match(/(\d+(?:\.\d+)?)\s*(?:mm|cm|in|inch)?/i);
  if (!match) return null;
  const val = parseFloat(match[1]);
  return isNaN(val) ? null : val;
}

function extractDimAfterKeyword(text, keywords) {
  for (const kw of keywords) {
    const afterKw = new RegExp(`${kw}\\s+(\\d+(?:\\.\\d+)?)\\s*(?:mm|cm)?`, "i");
    const beforeKw = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(?:mm|cm)?\\s+${kw}`, "i");
    const m1 = text.match(afterKw);
    if (m1) return parseFloat(m1[1]);
    const m2 = text.match(beforeKw);
    if (m2) return parseFloat(m2[1]);
  }
  return null;
}

function tryNormalizeCube(text) {
  const lower = text.toLowerCase();
  const isCube =
    /\bcube\b/.test(lower) ||
    /block\s+with\s+equal\s+sides/.test(lower) ||
    /equal\s+sides/.test(lower);
  if (!isCube) return null;

  let side = null;
  const mmCube = lower.match(/(\d+(?:\.\d+)?)\s*mm\s+cube/i);
  if (mmCube) side = parseFloat(mmCube[1]);
  if (!side) {
    const m = lower.match(/cube\s+with\s+(\d+(?:\.\d+)?)\s*(?:mm)?\s+sides?/i);
    if (m) side = parseFloat(m[1]);
  }
  if (!side) {
    const m = lower.match(/sides?\s+of\s+(\d+(?:\.\d+)?)\s*(?:mm)?/i);
    if (m) side = parseFloat(m[1]);
  }
  if (!side) {
    const m = lower.match(/(\d+(?:\.\d+)?)\s*mm\s+(?:on\s+each|per)\s+side/i);
    if (m) side = parseFloat(m[1]);
  }
  if (!side) side = extractFirstNumber(lower);
  if (!side || side <= 0) side = 20;
  side = Math.max(3, Math.min(500, side));

  return {
    family: "standoff_block",
    parameters: { length: side, width: side, height: side, hole_diameter: 0 },
    confidence: 0.97,
    is_primitive: true,
  };
}

function tryNormalizeCylinder(text) {
  const lower = text.toLowerCase();
  const isCylinder = /\bcylinder\b/.test(lower) || /\bcylindrical\b/.test(lower);
  if (!isCylinder) return null;

  let diameter = null;
  const diaPatterns = [
    /(\d+(?:\.\d+)?)\s*mm\s+(?:diameter|dia|od)\b/i,
    /\b(?:diameter|dia|od)\s+(\d+(?:\.\d+)?)\s*mm/i,
    /\b(?:diameter|dia|od)\s*[=:]?\s*(\d+(?:\.\d+)?)/i,
  ];
  for (const p of diaPatterns) {
    const m = lower.match(p);
    if (m) { diameter = parseFloat(m[1]); break; }
  }

  let height = null;
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
    parameters: { outer_diameter: diameter, inner_diameter: 0, length: height },
    confidence: 0.95,
    is_primitive: true,
  };
}

function tryNormalizeRingOrSpacer(text) {
  const lower = text.toLowerCase();
  const isRingOrSpacer =
    /\bring\b/.test(lower) ||
    /\bspacer\b/.test(lower) ||
    /\bbushing\b/.test(lower) ||
    /\bwasher\b/.test(lower);
  if (!isRingOrSpacer) return null;

  let od = null;
  const odPatterns = [
    /(\d+(?:\.\d+)?)\s*mm\s+(?:outer\s+diameter|od|outside\s+diameter)\b/i,
    /\b(?:outer\s+diameter|outside\s+diameter|od)\s+(\d+(?:\.\d+)?)\s*mm/i,
    /\b(?:outer\s+diameter|outside\s+diameter|od)\s*[=:]?\s*(\d+(?:\.\d+)?)/i,
  ];
  for (const p of odPatterns) {
    const m = lower.match(p);
    if (m) { od = parseFloat(m[1]); break; }
  }

  let id = null;
  const idPatterns = [
    /(\d+(?:\.\d+)?)\s*mm\s+(?:inner\s+diameter|id|inside\s+diameter|bore|hole)\b/i,
    /\b(?:inner\s+diameter|inside\s+diameter|id|bore|hole)\s+(\d+(?:\.\d+)?)\s*mm/i,
    /\b(?:inner\s+diameter|inside\s+diameter|id|bore|hole)\s*[=:]?\s*(\d+(?:\.\d+)?)/i,
  ];
  for (const p of idPatterns) {
    const m = lower.match(p);
    if (m) { id = parseFloat(m[1]); break; }
  }

  let length = null;
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
    parameters: { outer_diameter: od, inner_diameter: id, length },
    confidence: 0.93,
    is_primitive: true,
  };
}

function tryNormalizePrimitive(prompt) {
  if (!prompt || typeof prompt !== "string") return null;
  return (
    tryNormalizeCube(prompt) ??
    tryNormalizeCylinder(prompt) ??
    tryNormalizeRingOrSpacer(prompt) ??
    null
  );
}

// ── Test cases ────────────────────────────────────────────────────────────────

const tests = [
  // Cube cases
  {
    prompt: "make a cube with 5mm sides",
    expectFamily: "standoff_block",
    expectDims: { length: 5, width: 5, height: 5, hole_diameter: 0 },
  },
  {
    prompt: "5mm cube",
    expectFamily: "standoff_block",
    expectDims: { length: 5, width: 5, height: 5 },
  },
  {
    prompt: "cube with sides of 10mm",
    expectFamily: "standoff_block",
    expectDims: { length: 10, width: 10, height: 10 },
  },
  {
    prompt: "20mm cube please",
    expectFamily: "standoff_block",
    expectDims: { length: 20, width: 20, height: 20 },
  },
  {
    prompt: "I need a 15mm on each side cube",
    expectFamily: "standoff_block",
    expectDims: { length: 15, width: 15, height: 15 },
  },
  // Cylinder cases
  {
    prompt: "make a cylinder 20mm diameter 30mm tall",
    expectFamily: "spacer",
    expectDims: { outer_diameter: 20, inner_diameter: 0 },
  },
  {
    prompt: "cylindrical peg 10mm diameter 50mm length",
    expectFamily: "spacer",
    expectDims: { outer_diameter: 10, length: 50 },
  },
  // Ring/spacer cases
  {
    prompt: "make a ring 30mm od 10mm id 5mm thick",
    expectFamily: "spacer",
    expectDims: { outer_diameter: 30, inner_diameter: 10 },
  },
  {
    prompt: "I need a spacer 20mm outer diameter 8mm bore 15mm length",
    expectFamily: "spacer",
    expectDims: { outer_diameter: 20, inner_diameter: 8, length: 15 },
  },
  // Should NOT match (no primitive)
  {
    prompt: "make a bracket to hold my monitor",
    expectFamily: null,
  },
  {
    prompt: "I need a cable clip for 8mm wire",
    expectFamily: null,
  },
  {
    prompt: "design an enclosure for my Arduino",
    expectFamily: null,
  },
];

let pass = 0, fail = 0;
for (const t of tests) {
  const result = tryNormalizePrimitive(t.prompt);

  if (t.expectFamily === null) {
    if (result === null) {
      console.log(`✓ PASS [no-match]: "${t.prompt}" → null`);
      pass++;
    } else {
      console.log(`✗ FAIL [no-match]: "${t.prompt}" → expected null, got ${result.family}`);
      fail++;
    }
  } else {
    if (!result) {
      console.log(`✗ FAIL [match]: "${t.prompt}" → expected ${t.expectFamily}, got null`);
      fail++;
      continue;
    }
    if (result.family !== t.expectFamily) {
      console.log(`✗ FAIL [family]: "${t.prompt}" → expected ${t.expectFamily}, got ${result.family}`);
      fail++;
      continue;
    }
    let dimOk = true;
    for (const [k, v] of Object.entries(t.expectDims ?? {})) {
      if (result.parameters[k] !== v) {
        console.log(`✗ FAIL [dim ${k}]: "${t.prompt}" → expected ${k}=${v}, got ${result.parameters[k]}`);
        dimOk = false;
        fail++;
        break;
      }
    }
    if (dimOk) {
      console.log(`✓ PASS [${result.family}]: "${t.prompt}" → ${JSON.stringify(result.parameters)}`);
      pass++;
    }
  }
}

console.log(`\n${"─".repeat(60)}`);
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
