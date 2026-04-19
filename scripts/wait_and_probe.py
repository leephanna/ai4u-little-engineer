"""
Wait for Vercel deployment of commit d38a97c to go live, then run live probes.
"""
import requests
import json
import time
import sys
import os

VERCEL_TOKEN = os.environ.get("VERCEL_TOKEN", "")
TEAM_ID = "team_tijiRx4i1cQPPiNUA5HJFxOE"
PROJECT_ID = "prj_ypBKnm0KbFrWqxwvJ0SkAe5RJOnF"
TARGET_COMMIT = "d38a97c"
ADMIN_BYPASS_KEY = "891p-JU7zTvLfTAGO0we9S9LQd1wKjW33AJYILqQrhk"
BASE_URL = "https://ai4u-little-engineer-web.vercel.app"
VERCEL_HEADERS = {"Authorization": f"Bearer {VERCEL_TOKEN}"}

def get_latest_deployment():
    r = requests.get(
        f"https://api.vercel.com/v6/deployments?projectId={PROJECT_ID}&teamId={TEAM_ID}&limit=3&target=production",
        headers=VERCEL_HEADERS,
        timeout=15,
    )
    return r.json().get("deployments", [])

def check_deployment_ready():
    deps = get_latest_deployment()
    for d in deps:
        meta = d.get("meta", {})
        sha = meta.get("githubCommitSha", "")
        state = d.get("readyState", "")
        if sha.startswith(TARGET_COMMIT):
            return state, d.get("uid"), d.get("url")
    # Also check if any BUILDING deployment exists
    for d in deps:
        if d.get("readyState") in ("BUILDING", "QUEUED", "INITIALIZING"):
            meta = d.get("meta", {})
            sha = meta.get("githubCommitSha", "")
            return f"BUILDING({sha[:7]})", d.get("uid"), d.get("url")
    return None, None, None

print("=" * 70)
print("WAITING FOR VERCEL DEPLOYMENT OF d38a97c")
print("=" * 70)

# Wait up to 5 minutes for deployment
max_wait = 300
start = time.time()
while time.time() - start < max_wait:
    state, dep_id, dep_url = check_deployment_ready()
    elapsed = int(time.time() - start)
    print(f"[{elapsed:3d}s] state={state} dep_id={dep_id}")
    if state == "READY":
        print(f"\n✓ Deployment READY: {dep_id}")
        print(f"  URL: {dep_url}")
        break
    time.sleep(15)
else:
    print("TIMEOUT: Deployment did not go READY within 5 minutes")
    # Try probing anyway — production might already be serving it
    print("Attempting probe anyway...")

# Wait an extra 10s for CDN propagation
print("\nWaiting 10s for CDN propagation...")
time.sleep(10)

# ─── LIVE PROBE ──────────────────────────────────────────────────────────────

print()
print("=" * 70)
print("LIVE PROBE: GET /api/probe")
print("=" * 70)

probe_headers = {
    "x-admin-bypass-key": ADMIN_BYPASS_KEY,
    "Content-Type": "application/json",
    "Accept": "application/json",
}

r = requests.get(
    f"{BASE_URL}/api/probe",
    headers=probe_headers,
    timeout=30,
)
print(f"HTTP Status: {r.status_code}")
print(f"Response headers:")
for k, v in r.headers.items():
    if k.lower() in ("content-type", "x-vercel-id", "x-matched-path", "x-powered-by"):
        print(f"  {k}: {v}")

if r.status_code == 200:
    body = r.json()
    print(f"\nFull response:")
    print(json.dumps(body, indent=2))

    # Extract key proof fields
    commit_sha = body.get("deployment", {}).get("commit_sha", "N/A")
    all_pass = body.get("normalizer", {}).get("all_tests_pass", False)
    tests = body.get("normalizer", {}).get("tests", {})

    print()
    print("=" * 70)
    print("PROOF SUMMARY")
    print("=" * 70)
    print(f"  Live commit SHA:     {commit_sha}")
    print(f"  Target commit SHA:   d38a97c (full: d38a97c...)")
    sha_match = commit_sha.startswith("d38a97c") or "d38a97c" in commit_sha
    print(f"  SHA match:           {'✓ YES' if sha_match else '✗ NO (may be newer commit)'}")
    print(f"  All normalizer pass: {'✓ YES' if all_pass else '✗ NO'}")
    print()
    for name, t in tests.items():
        status = "✓ PASS" if t.get("pass") else "✗ FAIL"
        print(f"  {status}: {name}")
        print(f"           input:   {t.get('input')}")
        print(f"           family:  {t.get('got_family')} (expected: {t.get('expected_family')})")
        print(f"           params:  {t.get('got_params')}")
else:
    print(f"ERROR: {r.text[:500]}")

# ─── LIVE PROBE: interpret route with cube ────────────────────────────────────

print()
print("=" * 70)
print("LIVE PROBE: POST /api/intake/interpret (cube)")
print("=" * 70)

r2 = requests.post(
    f"{BASE_URL}/api/intake/interpret",
    headers={**probe_headers, "Content-Type": "application/json"},
    json={"text": "make a cube with 5mm sides"},
    timeout=30,
)
print(f"HTTP Status: {r2.status_code}")
print(f"x-commit-sha:      {r2.headers.get('x-commit-sha', 'N/A')}")
print(f"x-source:          {r2.headers.get('x-source', 'N/A')}")
print(f"x-llm-bypassed:    {r2.headers.get('x-llm-bypassed', 'N/A')}")
print(f"x-primitive-family:{r2.headers.get('x-primitive-family', 'N/A')}")

if r2.status_code == 200:
    body2 = r2.json()
    print(f"\nResponse body:")
    print(json.dumps(body2, indent=2)[:1500])

    proof = body2.get("_proof", {})
    family = body2.get("family_candidate")
    is_primitive = body2.get("is_primitive")
    dims = body2.get("extracted_dimensions", {})

    print()
    print("  Proof fields:")
    print(f"    family_candidate: {family}")
    print(f"    is_primitive:     {is_primitive}")
    print(f"    dimensions:       {dims}")
    print(f"    _proof.source:    {proof.get('source')}")
    print(f"    _proof.llm_bypassed: {proof.get('llm_bypassed')}")
    print(f"    _proof.commit_sha:   {proof.get('commit_sha')}")

    print()
    print("  CASE 1 VERDICT:")
    c1_pass = (
        family == "standoff_block" and
        is_primitive == True and
        proof.get("llm_bypassed") == True and
        proof.get("source") == "primitive_fast_path"
    )
    print(f"    {'✓ PASS' if c1_pass else '✗ FAIL'}: cube → standoff_block via primitive fast path")
else:
    print(f"ERROR: {r2.text[:500]}")

print()
print("=" * 70)
print("DONE")
print("=" * 70)
