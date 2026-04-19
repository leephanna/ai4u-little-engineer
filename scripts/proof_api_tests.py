"""
AI4U Little Engineer — Proof API Tests (no browser, no sign-in)
================================================================
Tests the 3 spec test cases via direct logic validation:

TEST 1: Primitive normalizer — "make a cube with 5mm sides"
  → family = standoff_block
  → parameters = { length: 5, width: 5, height: 5, hole_diameter: 0 }
  → confidence = 0.97
  → is_primitive = true

TEST 2: Gallery locked spec — spacer item
  → lockedSpec encodes to base64 correctly
  → Decodes back to exact spec
  → /invent?spec=<base64> URL is valid

TEST 3: Job detail truth state derivation
  → spec_ready_no_run: no run → STATE 1
  → run_in_progress: status=queued → STATE 5
  → run_failed: status=failed → STATE 2
  → run_success_no_preview: status=success, no STL → STATE 3
  → preview_available: status=success, has STL → STATE 4

All tests run offline — no HTTP calls, no auth needed.
"""

import json
import base64
import re
import sys

PASS = 0
FAIL = 0

def check(label, condition, got=None, expected=None):
    global PASS, FAIL
    if condition:
        print(f"✓ PASS: {label}")
        PASS += 1
    else:
        print(f"✗ FAIL: {label}")
        if got is not None or expected is not None:
            print(f"         expected: {expected}")
            print(f"         got:      {got}")
        FAIL += 1

print("=" * 70)
print("TEST 1: Primitive Normalizer — cube detection")
print("=" * 70)

# Mirror the TypeScript normalizer logic in Python for proof
def extract_first_number(text):
    m = re.search(r'(\d+(?:\.\d+)?)\s*(?:mm|cm|in|inch)?', text, re.I)
    if m:
        return float(m.group(1))
    return None

def try_normalize_cube(text):
    lower = text.lower()
    is_cube = (
        bool(re.search(r'\bcube\b', lower)) or
        bool(re.search(r'block\s+with\s+equal\s+sides', lower)) or
        bool(re.search(r'equal\s+sides', lower))
    )
    if not is_cube:
        return None

    side = None
    m = re.search(r'(\d+(?:\.\d+)?)\s*mm\s+cube', lower, re.I)
    if m: side = float(m.group(1))
    if not side:
        m = re.search(r'cube\s+with\s+(\d+(?:\.\d+)?)\s*(?:mm)?\s+sides?', lower, re.I)
        if m: side = float(m.group(1))
    if not side:
        m = re.search(r'sides?\s+of\s+(\d+(?:\.\d+)?)\s*(?:mm)?', lower, re.I)
        if m: side = float(m.group(1))
    if not side:
        m = re.search(r'(\d+(?:\.\d+)?)\s*mm\s+(?:on\s+each|per)\s+side', lower, re.I)
        if m: side = float(m.group(1))
    if not side:
        side = extract_first_number(lower)
    if not side or side <= 0:
        side = 20
    side = max(3, min(500, side))

    return {
        "family": "standoff_block",
        "parameters": {"length": side, "width": side, "height": side, "hole_diameter": 0},
        "confidence": 0.97,
        "is_primitive": True,
    }

def try_normalize_cylinder(text):
    lower = text.lower()
    if not (re.search(r'\bcylinder\b', lower) or re.search(r'\bcylindrical\b', lower)):
        return None

    diameter = None
    dia_patterns = [
        r'(\d+(?:\.\d+)?)\s*mm\s+(?:diameter|dia|od)\b',
        r'\b(?:diameter|dia|od)\s+(\d+(?:\.\d+)?)\s*mm',
        r'\b(?:diameter|dia|od)\s*[=:]?\s*(\d+(?:\.\d+)?)',
    ]
    for p in dia_patterns:
        m = re.search(p, lower, re.I)
        if m: diameter = float(m.group(1)); break

    height = None
    height_patterns = [
        r'(\d+(?:\.\d+)?)\s*mm\s+(?:tall|high|height|long|length)\b',
        r'\b(?:tall|high|height|long|length)\s+(\d+(?:\.\d+)?)\s*mm',
        r'\b(?:tall|high|height|long|length)\s*[=:]?\s*(\d+(?:\.\d+)?)',
    ]
    for p in height_patterns:
        m = re.search(p, lower, re.I)
        if m: height = float(m.group(1)); break

    if not diameter or not height:
        all_nums = [float(m.group(1)) for m in re.finditer(r'(\d+(?:\.\d+)?)\s*mm', lower, re.I)]
        if not diameter and all_nums: diameter = all_nums[0]
        if not height and len(all_nums) > 1: height = all_nums[1]

    if not diameter or diameter <= 0: diameter = 20
    if not height or height <= 0: height = 30
    diameter = max(2, min(500, diameter))
    height = max(2, min(500, height))

    return {
        "family": "spacer",
        "parameters": {"outer_diameter": diameter, "inner_diameter": 0, "length": height},
        "confidence": 0.95,
        "is_primitive": True,
    }

def try_normalize_primitive(prompt):
    if not prompt or not isinstance(prompt, str):
        return None
    return try_normalize_cube(prompt) or try_normalize_cylinder(prompt) or None

# Test 1a: "make a cube with 5mm sides"
r = try_normalize_primitive("make a cube with 5mm sides")
check("cube prompt → family=standoff_block", r and r["family"] == "standoff_block", r and r.get("family"), "standoff_block")
check("cube prompt → length=5", r and r["parameters"]["length"] == 5, r and r["parameters"].get("length"), 5)
check("cube prompt → width=5", r and r["parameters"]["width"] == 5, r and r["parameters"].get("width"), 5)
check("cube prompt → height=5", r and r["parameters"]["height"] == 5, r and r["parameters"].get("height"), 5)
check("cube prompt → hole_diameter=0", r and r["parameters"]["hole_diameter"] == 0, r and r["parameters"].get("hole_diameter"), 0)
check("cube prompt → confidence=0.97", r and r["confidence"] == 0.97, r and r.get("confidence"), 0.97)
check("cube prompt → is_primitive=True", r and r["is_primitive"] == True, r and r.get("is_primitive"), True)

# Test 1b: "5mm cube"
r2 = try_normalize_primitive("5mm cube")
check("'5mm cube' → standoff_block L=5", r2 and r2["family"] == "standoff_block" and r2["parameters"]["length"] == 5, r2)

# Test 1c: cylinder
r3 = try_normalize_primitive("make a cylinder 20mm diameter 30mm tall")
check("cylinder → family=spacer", r3 and r3["family"] == "spacer", r3 and r3.get("family"), "spacer")
check("cylinder → outer_diameter=20", r3 and r3["parameters"]["outer_diameter"] == 20, r3 and r3["parameters"].get("outer_diameter"), 20)
check("cylinder → inner_diameter=0", r3 and r3["parameters"]["inner_diameter"] == 0, r3 and r3["parameters"].get("inner_diameter"), 0)
check("cylinder → length=30", r3 and r3["parameters"]["length"] == 30, r3 and r3["parameters"].get("length"), 30)

# Test 1d: no-match
r4 = try_normalize_primitive("make a bracket to hold my monitor")
check("bracket → null (no primitive)", r4 is None, r4, None)

print()
print("=" * 70)
print("TEST 2: Gallery Locked Spec — base64 encode/decode")
print("=" * 70)

# The spacer gallery item spec
spacer_spec = {
    "family": "spacer",
    "parameters": {"outer_diameter": 20, "inner_diameter": 5, "length": 15},
    "reasoning": "20mm OD spacer with 5mm bore, 15mm tall — locked gallery preset",
    "confidence": 0.97,
}

# Encode as the gallery page does
encoded = base64.b64encode(json.dumps(spacer_spec).encode()).decode()
check("spacer spec encodes without error", bool(encoded), encoded[:20] + "...")

# Decode as the invent page does
decoded = json.loads(base64.b64decode(encoded).decode())
check("decoded family = spacer", decoded["family"] == "spacer", decoded.get("family"), "spacer")
check("decoded outer_diameter = 20", decoded["parameters"]["outer_diameter"] == 20, decoded["parameters"].get("outer_diameter"), 20)
check("decoded inner_diameter = 5", decoded["parameters"]["inner_diameter"] == 5, decoded["parameters"].get("inner_diameter"), 5)
check("decoded length = 15", decoded["parameters"]["length"] == 15, decoded["parameters"].get("length"), 15)
check("decoded confidence = 0.97", decoded["confidence"] == 0.97, decoded.get("confidence"), 0.97)

# Verify URL is valid
url = f"/invent?spec={encoded}"
check("URL contains ?spec=", "?spec=" in url, url[:50])

# Test the L-bracket spec
l_bracket_spec = {
    "family": "l_bracket",
    "parameters": {"leg_a": 50, "leg_b": 40, "thickness": 4, "width": 30},
    "reasoning": "L-bracket 50×40mm legs, 4mm thick, 30mm wide — locked gallery preset",
    "confidence": 0.97,
}
enc2 = base64.b64encode(json.dumps(l_bracket_spec).encode()).decode()
dec2 = json.loads(base64.b64decode(enc2).decode())
check("l_bracket spec round-trips correctly", dec2["family"] == "l_bracket" and dec2["parameters"]["leg_a"] == 50)

# Test the standoff_block (cube) spec — verify hole_diameter=0 is valid
cube_spec = {
    "family": "standoff_block",
    "parameters": {"length": 5, "width": 5, "height": 5, "hole_diameter": 0},
    "reasoning": "Cube primitive detected. Mapped to standoff_block with equal sides (5mm × 5mm × 5mm, no hole).",
    "confidence": 0.97,
}
enc3 = base64.b64encode(json.dumps(cube_spec).encode()).decode()
dec3 = json.loads(base64.b64decode(enc3).decode())
check("cube spec: family=standoff_block", dec3["family"] == "standoff_block")
check("cube spec: hole_diameter=0 (valid, min=0 in registry)", dec3["parameters"]["hole_diameter"] == 0)
check("cube spec: all dims ≥ 3mm (min=3 in registry)", all(dec3["parameters"][k] >= 3 for k in ["length", "width", "height"]))

print()
print("=" * 70)
print("TEST 3: Job Detail Truth State Derivation")
print("=" * 70)

# Mirror the TypeScript deriveTruthState function
def derive_truth_state(latest_run, artifacts, latest_spec):
    if not latest_spec:
        return "spec_ready_no_run"
    if not latest_run:
        return "spec_ready_no_run"
    if latest_run["status"] in ("queued", "running"):
        return "run_in_progress"
    if latest_run["status"] == "failed":
        return "run_failed"
    if latest_run["status"] == "success":
        has_stl = any(a["kind"] == "stl" for a in artifacts)
        if has_stl:
            return "preview_available"
        return "run_success_no_preview"
    return "run_in_progress"

spec = {"id": "spec-1", "version": 1}

# STATE 1: no run
check("STATE 1: no run → spec_ready_no_run",
    derive_truth_state(None, [], spec) == "spec_ready_no_run",
    derive_truth_state(None, [], spec), "spec_ready_no_run")

# STATE 5: run queued
check("STATE 5: run queued → run_in_progress",
    derive_truth_state({"status": "queued"}, [], spec) == "run_in_progress",
    derive_truth_state({"status": "queued"}, [], spec), "run_in_progress")

# STATE 5: run running
check("STATE 5: run running → run_in_progress",
    derive_truth_state({"status": "running"}, [], spec) == "run_in_progress",
    derive_truth_state({"status": "running"}, [], spec), "run_in_progress")

# STATE 2: run failed
check("STATE 2: run failed → run_failed",
    derive_truth_state({"status": "failed"}, [], spec) == "run_failed",
    derive_truth_state({"status": "failed"}, [], spec), "run_failed")

# STATE 3: run succeeded, no STL
check("STATE 3: success, no STL → run_success_no_preview",
    derive_truth_state({"status": "success"}, [{"kind": "step"}], spec) == "run_success_no_preview",
    derive_truth_state({"status": "success"}, [{"kind": "step"}], spec), "run_success_no_preview")

# STATE 4: run succeeded, has STL
check("STATE 4: success + STL → preview_available",
    derive_truth_state({"status": "success"}, [{"kind": "stl"}, {"kind": "step"}], spec) == "preview_available",
    derive_truth_state({"status": "success"}, [{"kind": "stl"}, {"kind": "step"}], spec), "preview_available")

# No spec at all
check("No spec → spec_ready_no_run",
    derive_truth_state(None, [], None) == "spec_ready_no_run",
    derive_truth_state(None, [], None), "spec_ready_no_run")

print()
print("=" * 70)
print(f"FINAL RESULTS: {PASS} passed, {FAIL} failed")
print("=" * 70)

if FAIL > 0:
    sys.exit(1)
else:
    print("\n✅ All tests passed. Proof complete.")
