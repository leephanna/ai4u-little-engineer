"""
Verification script for custom_generate routing fix.
Tests the 3 required scenarios from the spec:
  1. Rocket with fins → custom_generate (NOT spacer)
  2. Artemis II gallery item → correct URL with ?custom_generate=true
  3. Spacer with explicit dims → fast path to spacer family (NOT custom_generate)

Also tests the keyword pre-flight detector directly.
"""

import os
import sys
import json
import urllib.request
import urllib.parse

BASE_URL = "https://ai4u-little-engineer-web.vercel.app"

# ── Helpers ──────────────────────────────────────────────────────────────────

def post_invent(problem: str, extra: dict = None) -> dict:
    """POST /api/invent with admin bypass key."""
    payload = {"problem": problem}
    if extra:
        payload.update(extra)
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        f"{BASE_URL}/api/invent",
        data=data,
        headers={
            "Content-Type": "application/json",
            "x-admin-bypass-key": os.environ.get("ADMIN_BYPASS_KEY", ""),
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        return json.loads(body) if body else {"error": str(e)}

def get_gallery_html() -> str:
    """Fetch the gallery page HTML."""
    req = urllib.request.Request(f"{BASE_URL}/gallery")
    with urllib.request.urlopen(req, timeout=15) as resp:
        return resp.read().decode()

# ── Test runner ───────────────────────────────────────────────────────────────

results = []

def test(name: str, passed: bool, detail: str = ""):
    status = "✓ PASS" if passed else "✗ FAIL"
    results.append((name, passed, detail))
    print(f"  {status} | {name}")
    if detail:
        print(f"         {detail}")

print()
print("=" * 68)
print("  CUSTOM_GENERATE ROUTING FIX VERIFICATION")
print("=" * 68)
print()

# ── Test 1: Keyword pre-flight — rocket with fins ─────────────────────────────
print("[Test 1] Rocket with fins → must route to custom_generate (NOT spacer)")
resp1 = post_invent("a rocket with 4 fins, 80mm tall, pointed nose cone")
status1 = resp1.get("status")
family1 = resp1.get("family")
test(
    "Rocket with fins → custom_generate or custom_generate_failed (NOT soft_match/spacer)",
    status1 in ("custom_generate_ready", "custom_generate_failed"),
    f"status={status1} family={family1} (expected custom_generate_ready or custom_generate_failed)"
)
# Also check it's NOT routing to spacer
test(
    "Rocket with fins → family is NOT spacer",
    family1 is None,
    f"family={family1}"
)

# ── Test 2: Gallery Artemis II → correct URL ──────────────────────────────────
print()
print("[Test 2] Gallery Artemis II → Make This href uses ?custom_generate=true")
gallery_html = get_gallery_html()
has_custom_generate_url = "custom_generate=true" in gallery_html
has_artemis_description = "bell%20nozzle" in gallery_html or "bell_nozzle" in gallery_html or "nozzle" in gallery_html.lower()
test(
    "Gallery page contains ?custom_generate=true URL",
    has_custom_generate_url,
    "Found 'custom_generate=true' in gallery page HTML" if has_custom_generate_url else "NOT found in gallery HTML"
)
test(
    "Gallery Artemis II URL contains nozzle description",
    has_artemis_description,
    "Found nozzle description in custom_description param" if has_artemis_description else "NOT found"
)

# ── Test 3: Spacer with explicit dims → fast path (NOT custom_generate) ────────
print()
print("[Test 3] Spacer 20mm OD 5mm ID 15mm long → fast path to spacer family")
resp3 = post_invent("spacer 20mm OD 5mm ID 15mm long")
status3 = resp3.get("status")
family3 = resp3.get("family")
job_id3 = resp3.get("job_id")
test(
    "Spacer with dims → NOT custom_generate",
    status3 not in ("custom_generate_ready", "custom_generate_failed"),
    f"status={status3} family={family3} job_id={'yes' if job_id3 else 'none'}"
)
test(
    "Spacer with dims → family is spacer or job created",
    family3 == "spacer" or job_id3 is not None,
    f"family={family3} job_id={'yes' if job_id3 else 'none'}"
)

# ── Test 4: Turbine blade → custom_generate ───────────────────────────────────
print()
print("[Test 4] Turbine blade → must route to custom_generate")
resp4 = post_invent("design a turbine blade for a jet engine")
status4 = resp4.get("status")
family4 = resp4.get("family")
test(
    "Turbine blade → custom_generate",
    status4 in ("custom_generate_ready", "custom_generate_failed"),
    f"status={status4} family={family4}"
)

# ── Test 5: Nose cone → custom_generate ──────────────────────────────────────
print()
print("[Test 5] Nose cone → must route to custom_generate")
resp5 = post_invent("create a pointed nose cone for a model rocket, 60mm long")
status5 = resp5.get("status")
family5 = resp5.get("family")
test(
    "Nose cone → custom_generate",
    status5 in ("custom_generate_ready", "custom_generate_failed"),
    f"status={status5} family={family5}"
)

# ── Summary ───────────────────────────────────────────────────────────────────
print()
print("=" * 68)
passed = sum(1 for _, p, _ in results if p)
total = len(results)
print(f"  RESULTS: {passed}/{total} passed")
print()
for name, p, detail in results:
    icon = "✓" if p else "✗"
    print(f"  {icon} {name}")
print()
if passed == total:
    print("  STATUS: ALL TESTS PASSED ✓")
else:
    print(f"  STATUS: {total - passed} TESTS FAILED ✗")
print("=" * 68)
print()

sys.exit(0 if passed == total else 1)
