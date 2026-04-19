"""
Live Production Runtime Trace
==============================
Tests the actual live API routes on ai4u-little-engineer-web.vercel.app
to identify the exact runtime path for each case.

NO browser auth needed — we test the API routes directly.
"""
import requests
import json
import base64
import sys
import time

BASE_URL = "https://ai4u-little-engineer-web.vercel.app"
HEADERS = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "User-Agent": "AI4U-LiveProbe/1.0",
}

results = {}

def section(title):
    print()
    print("=" * 70)
    print(title)
    print("=" * 70)

def check(label, condition, detail=""):
    status = "✓ PASS" if condition else "✗ FAIL"
    print(f"  {status}: {label}")
    if detail:
        print(f"           {detail}")
    return condition

# ─── CASE 1: Cube via /api/intake/interpret ──────────────────────────────────

section("CASE 1: Cube prompt → /api/intake/interpret")
print("Testing: POST /api/intake/interpret")
print("Payload: { prompt: 'make a cube with 5mm sides' }")

try:
    r = requests.post(
        f"{BASE_URL}/api/intake/interpret",
        headers=HEADERS,
        json={"prompt": "make a cube with 5mm sides"},
        timeout=20,
    )
    print(f"\nHTTP Status: {r.status_code}")
    print(f"Response headers:")
    for k, v in r.headers.items():
        if k.lower() in ("content-type", "x-vercel-id", "x-matched-path", "x-powered-by"):
            print(f"  {k}: {v}")

    body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    print(f"\nResponse body:")
    print(json.dumps(body, indent=2)[:2000])

    results["case1_status"] = r.status_code
    results["case1_body"] = body

    family = body.get("family") or body.get("intake_family_candidate") or body.get("data", {}).get("family")
    is_primitive = body.get("is_primitive") or body.get("data", {}).get("is_primitive")
    llm_bypassed = body.get("llm_bypassed") or body.get("data", {}).get("llm_bypassed")

    print(f"\n--- Trace Analysis ---")
    check("HTTP 200", r.status_code == 200, f"got {r.status_code}")
    check("family = standoff_block", family == "standoff_block", f"got: {family}")
    check("is_primitive = true", is_primitive == True, f"got: {is_primitive}")
    check("llm_bypassed = true (if instrumented)", llm_bypassed == True, f"got: {llm_bypassed}")

except Exception as e:
    print(f"ERROR: {e}")
    results["case1_error"] = str(e)

# ─── CASE 1b: Cube via /api/invent (direct) ──────────────────────────────────

section("CASE 1b: Cube prompt → /api/invent (direct POST)")
print("Testing: POST /api/invent")
print("Payload: { prompt: 'make a cube with 5mm sides' }")

try:
    r = requests.post(
        f"{BASE_URL}/api/invent",
        headers=HEADERS,
        json={"prompt": "make a cube with 5mm sides"},
        timeout=20,
    )
    print(f"\nHTTP Status: {r.status_code}")
    body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    print(f"\nResponse body (first 1000 chars):")
    print(json.dumps(body, indent=2)[:1000])

    results["case1b_status"] = r.status_code
    results["case1b_body"] = body

    # Check for auth requirement
    if r.status_code in (401, 403):
        print("  → Auth required for /api/invent (expected for production)")
        results["case1b_auth_required"] = True
    elif r.status_code == 200:
        job_id = body.get("jobId") or body.get("job_id") or body.get("id")
        family = body.get("family") or body.get("intake_family_candidate")
        print(f"  → Job created: {job_id}")
        print(f"  → Family: {family}")

except Exception as e:
    print(f"ERROR: {e}")
    results["case1b_error"] = str(e)

# ─── CASE 2: Gallery locked spec via /api/intake/interpret ───────────────────

section("CASE 2: Gallery locked spec — spacer preset")
print("Testing: The gallery item should NOT call /api/intake/interpret at all.")
print("Instead it should call /api/invent with pre-built spec.")
print()
print("Simulating: POST /api/invent with locked spec payload")

spacer_spec = {
    "family": "spacer",
    "parameters": {"outer_diameter": 20, "inner_diameter": 5, "length": 15},
    "reasoning": "20mm OD spacer with 5mm bore, 15mm tall — locked gallery preset",
    "confidence": 0.97,
}
encoded_spec = base64.b64encode(json.dumps(spacer_spec).encode()).decode()
print(f"Encoded spec (first 60 chars): {encoded_spec[:60]}...")

# Test the /invent page URL with ?spec= param
spec_url = f"{BASE_URL}/invent?spec={encoded_spec}"
print(f"\nGallery URL: /invent?spec={encoded_spec[:40]}...")

try:
    r = requests.get(
        spec_url,
        headers={"User-Agent": "AI4U-LiveProbe/1.0", "Accept": "text/html"},
        timeout=20,
        allow_redirects=True,
    )
    print(f"\nHTTP Status: {r.status_code}")
    print(f"Final URL: {r.url}")
    print(f"x-matched-path: {r.headers.get('x-matched-path', 'N/A')}")

    # Check if the page contains the spec param handling
    html = r.text
    results["case2_status"] = r.status_code
    results["case2_contains_spec"] = "spec" in html.lower() or "locked" in html.lower()

    check("HTTP 200 for /invent?spec=", r.status_code == 200, f"got {r.status_code}")
    check("Page loads (not redirect to signin)", "/sign-in" not in r.url, f"redirected to: {r.url}")

    # Look for evidence of spec handling in the HTML
    if "initialLockedSpec" in html or "gallery preset" in html.lower() or "spec=" in html:
        print("  ✓ PASS: Page HTML contains spec-handling evidence")
    else:
        print("  ⚠ INFO: spec-handling markers not visible in HTML (may be client-side)")

except Exception as e:
    print(f"ERROR: {e}")
    results["case2_error"] = str(e)

# ─── CASE 3: Artemis/demo route ──────────────────────────────────────────────

section("CASE 3: Artemis/demo route")
print("Testing: GET /api/demo/artemis")

try:
    r = requests.get(
        f"{BASE_URL}/api/demo/artemis",
        headers=HEADERS,
        timeout=20,
    )
    print(f"\nHTTP Status: {r.status_code}")
    body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    print(f"\nResponse body:")
    print(json.dumps(body, indent=2)[:2000])

    results["case3_status"] = r.status_code
    results["case3_body"] = body

    if r.status_code == 200:
        family = body.get("family") or body.get("intake_family_candidate")
        params = body.get("parameters") or body.get("intake_dimensions")
        job_id = body.get("jobId") or body.get("job_id")
        print(f"\n--- Trace Analysis ---")
        check("HTTP 200", True)
        check("family present", bool(family), f"got: {family}")
        check("parameters present", bool(params), f"got: {params}")
        check("job_id present (if auth available)", bool(job_id), f"got: {job_id}")
    elif r.status_code in (401, 403):
        print("  → Auth required for Artemis demo")
        results["case3_auth_required"] = True

except Exception as e:
    print(f"ERROR: {e}")
    results["case3_error"] = str(e)

# ─── CASE 4: Job detail truth state ──────────────────────────────────────────

section("CASE 4: Job detail page — checking /jobs route")
print("Testing: GET /jobs (list page)")

try:
    r = requests.get(
        f"{BASE_URL}/jobs",
        headers={"User-Agent": "AI4U-LiveProbe/1.0", "Accept": "text/html"},
        timeout=20,
    )
    print(f"\nHTTP Status: {r.status_code}")
    print(f"Final URL: {r.url}")
    print(f"x-matched-path: {r.headers.get('x-matched-path', 'N/A')}")

    if "/sign-in" in r.url:
        print("  → /jobs requires auth (expected)")
        results["case4_auth_required"] = True
    else:
        html = r.text
        # Check for truth state labels
        for label in ["spec_ready_no_run", "run_in_progress", "run_failed", "run_success_no_preview", "preview_available"]:
            if label in html:
                print(f"  ✓ Found truth state label: {label}")
        results["case4_status"] = r.status_code

except Exception as e:
    print(f"ERROR: {e}")
    results["case4_error"] = str(e)

# ─── Check if interpret route has proof instrumentation ──────────────────────

section("INSTRUMENTATION CHECK: Does /api/intake/interpret return debug fields?")
print("Checking for x-source, x-commit-sha, llm_bypassed, is_primitive fields...")

try:
    r = requests.post(
        f"{BASE_URL}/api/intake/interpret",
        headers=HEADERS,
        json={"prompt": "5mm cube"},
        timeout=20,
    )
    body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}

    debug_fields = {
        "x-source": r.headers.get("x-source"),
        "x-commit-sha": r.headers.get("x-commit-sha"),
        "x-code-path": r.headers.get("x-code-path"),
        "is_primitive": body.get("is_primitive"),
        "llm_bypassed": body.get("llm_bypassed"),
        "source": body.get("source"),
        "code_path": body.get("code_path"),
        "family": body.get("family"),
    }
    print(f"\nDebug fields found:")
    for k, v in debug_fields.items():
        if v is not None:
            print(f"  {k}: {v}")
        else:
            print(f"  {k}: (not present)")

    results["instrumentation"] = debug_fields

except Exception as e:
    print(f"ERROR: {e}")

# ─── Summary ─────────────────────────────────────────────────────────────────

section("SUMMARY")
print(json.dumps(results, indent=2, default=str)[:3000])

print()
print("=" * 70)
print("KEY FINDINGS:")
print("=" * 70)

# Case 1 finding
c1 = results.get("case1_body", {})
c1_family = c1.get("family") or c1.get("intake_family_candidate") or c1.get("data", {}).get("family")
print(f"CASE 1 (cube/interpret): HTTP {results.get('case1_status', 'N/A')} | family={c1_family}")

# Case 2 finding
print(f"CASE 2 (gallery spec): HTTP {results.get('case2_status', 'N/A')} | auth_required={results.get('case2_auth_required', False)}")

# Case 3 finding
c3 = results.get("case3_body", {})
c3_family = c3.get("family") or c3.get("intake_family_candidate")
print(f"CASE 3 (artemis): HTTP {results.get('case3_status', 'N/A')} | family={c3_family} | auth_required={results.get('case3_auth_required', False)}")

# Case 4 finding
print(f"CASE 4 (jobs): HTTP {results.get('case4_status', 'N/A')} | auth_required={results.get('case4_auth_required', False)}")
