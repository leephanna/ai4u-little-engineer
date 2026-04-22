"""
Live Journey Proof Script
==========================
Waits for Vercel deployment of commit 90a920f, then runs all 3 journeys:

Journey A: POST /api/invent with cube prompt -> solid_block -> job created -> DB row -> cad_run
Journey B: POST /api/invent with locked gallery spec (spacer) -> job created -> DB row -> cad_run
Journey C: POST /api/demo/artemis -> job created -> DB row -> cad_run

For each journey, captures:
- HTTP response (job_id, family, status)
- DB row (jobs table)
- cad_run row
- Storage artifact (if available)

Also runs /api/probe to confirm normalizer.
"""
import requests
import json
import os
import time
import sys

# ── Config ────────────────────────────────────────────────────────────────────
PROD_URL = "https://ai4u-little-engineer-web.vercel.app"
SUPABASE_URL = "https://lphtdosxneplxgkygjom.supabase.co"
VERCEL_TOKEN = os.environ.get("VERCEL_TOKEN", "")
TEAM_ID = "team_tijiRx4i1cQPPiNUA5HJFxOE"
PROJECT_ID = "prj_ypBKnm0KbFrWqxwvJ0SkAe5RJOnF"
TARGET_COMMIT = "90a920f"

# ── Get secrets from Vercel ───────────────────────────────────────────────────
def get_vercel_env(key):
    if not VERCEL_TOKEN:
        return None
    r = requests.get(
        f"https://api.vercel.com/v9/projects/{PROJECT_ID}/env?teamId={TEAM_ID}",
        headers={"Authorization": f"Bearer {VERCEL_TOKEN}"}, timeout=15
    )
    envs = {e["key"]: e["id"] for e in r.json().get("envs", [])}
    env_id = envs.get(key)
    if not env_id:
        return None
    r2 = requests.get(
        f"https://api.vercel.com/v9/projects/{PROJECT_ID}/env/{env_id}?teamId={TEAM_ID}",
        headers={"Authorization": f"Bearer {VERCEL_TOKEN}"}, timeout=15
    )
    return r2.json().get("value")

print("Fetching secrets from Vercel...")
ADMIN_BYPASS_KEY = get_vercel_env("ADMIN_BYPASS_KEY")
SUPABASE_SERVICE_KEY = get_vercel_env("SUPABASE_SERVICE_ROLE_KEY")
print(f"ADMIN_BYPASS_KEY: {'[found]' if ADMIN_BYPASS_KEY else '[NOT FOUND]'}")
print(f"SUPABASE_SERVICE_KEY: {'[found]' if SUPABASE_SERVICE_KEY else '[NOT FOUND]'}")

SB_HEADERS = {
    "apikey": SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "Content-Type": "application/json",
    "Accept": "application/json",
}

BYPASS_HEADERS = {
    "Content-Type": "application/json",
    "X-Admin-Bypass-Key": ADMIN_BYPASS_KEY or "",
}

# ── Wait for deployment ───────────────────────────────────────────────────────
def wait_for_deployment(max_wait=480):
    print(f"\nWaiting for Vercel deployment of {TARGET_COMMIT}...")
    start = time.time()
    while time.time() - start < max_wait:
        try:
            r = requests.get(f"{PROD_URL}/api/probe",
                headers={"X-Admin-Bypass-Key": ADMIN_BYPASS_KEY or ""},
                timeout=15)
            if r.status_code == 200:
                data = r.json()
                sha = data.get("deployment", {}).get("commit_sha", "")
                if sha.startswith(TARGET_COMMIT):
                    print(f"✅ Deployment live! commit_sha={sha}")
                    return True
                else:
                    print(f"  Still deploying... live commit={sha[:7]}, target={TARGET_COMMIT}")
            elif r.status_code == 401:
                print(f"  Probe returned 401 (bypass key not yet deployed)")
            else:
                print(f"  Probe returned {r.status_code}")
        except Exception as e:
            print(f"  Connection error: {e}")
        time.sleep(20)
    print(f"❌ Deployment did not go live within {max_wait}s")
    return False

# ── DB helpers ────────────────────────────────────────────────────────────────
def get_job(job_id):
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/jobs?id=eq.{job_id}&select=id,status,requested_family,title,created_at,user_id",
        headers=SB_HEADERS, timeout=15
    )
    if r.status_code == 200 and r.json():
        return r.json()[0]
    return {"error": r.status_code, "body": r.text[:200]}

def get_cad_runs(job_id):
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/cad_runs?job_id=eq.{job_id}&select=id,status,generator_name,error_text,normalized_params_json,started_at,ended_at&order=started_at.desc",
        headers=SB_HEADERS, timeout=15
    )
    if r.status_code == 200:
        return r.json()
    return [{"error": r.status_code, "body": r.text[:200]}]

def check_storage(job_id):
    r = requests.get(
        f"{SUPABASE_URL}/storage/v1/object/list/cad-artifacts",
        headers=SB_HEADERS,
        json={"prefix": f"{job_id}/", "limit": 10},
        timeout=15
    )
    if r.status_code == 200:
        return r.json()
    return {"error": r.status_code, "body": r.text[:200]}

# ── Wait for job to complete ──────────────────────────────────────────────────
def wait_for_job(job_id, max_wait=120):
    print(f"  Waiting for job {job_id[:8]}... to complete (max {max_wait}s)")
    start = time.time()
    while time.time() - start < max_wait:
        job = get_job(job_id)
        status = job.get("status", "unknown")
        if status in ("awaiting_approval", "failed", "completed", "approved"):
            print(f"  Job reached terminal state: {status}")
            return job
        print(f"  Job status: {status} ({int(time.time()-start)}s elapsed)")
        time.sleep(10)
    return get_job(job_id)

# ── Journey A: Cube ───────────────────────────────────────────────────────────
def run_journey_a():
    print("\n" + "="*60)
    print("JOURNEY A: Cube prompt -> solid_block -> live job")
    print("="*60)
    payload = {
        "text": "Make a cube with 5mm sides. Don't ask for clarification. Just make a cube.",
    }
    print(f"POST {PROD_URL}/api/invent")
    print(f"Payload: {json.dumps(payload)}")
    r = requests.post(
        f"{PROD_URL}/api/invent",
        headers=BYPASS_HEADERS,
        json=payload,
        timeout=30
    )
    print(f"HTTP {r.status_code}")
    print(f"Headers: x-commit-sha={r.headers.get('x-commit-sha','N/A')}, x-source={r.headers.get('x-source','N/A')}, x-primitive-family={r.headers.get('x-primitive-family','N/A')}")

    if r.status_code not in (200, 201):
        print(f"❌ FAILED: {r.text[:500]}")
        return {"pass": False, "error": r.text[:500], "status": r.status_code}

    data = r.json()
    job_id = data.get("job_id") or data.get("id")
    family = data.get("family") or data.get("requested_family")
    print(f"job_id: {job_id}")
    print(f"family: {family}")
    print(f"Full response: {json.dumps(data, indent=2)[:500]}")

    if not job_id:
        print(f"❌ No job_id in response")
        return {"pass": False, "error": "No job_id", "data": data}

    # DB check
    print(f"\nDB check: jobs table for {job_id}")
    job_row = wait_for_job(job_id)
    print(f"Job row: {json.dumps(job_row, indent=2)}")

    cad_runs = get_cad_runs(job_id)
    print(f"\ncad_runs ({len(cad_runs)} rows):")
    for cr in cad_runs:
        print(f"  {json.dumps(cr, indent=2)[:300]}")

    storage = check_storage(job_id)
    print(f"\nStorage artifacts: {json.dumps(storage)[:300]}")

    family_correct = family == "solid_block" or job_row.get("requested_family") == "solid_block"
    has_cad_run = len(cad_runs) > 0 and "error" not in cad_runs[0]
    cad_success = any(cr.get("status") in ("success", "queued", "running") for cr in cad_runs)

    result = {
        "pass": family_correct and has_cad_run,
        "job_id": job_id,
        "family": family,
        "family_correct": family_correct,
        "job_status": job_row.get("status"),
        "cad_run_count": len(cad_runs),
        "cad_run_status": cad_runs[0].get("status") if cad_runs else None,
        "cad_success": cad_success,
        "commit_sha": r.headers.get("x-commit-sha", "N/A"),
        "source": r.headers.get("x-source", "N/A"),
        "primitive_family": r.headers.get("x-primitive-family", "N/A"),
    }
    print(f"\nJourney A result: {'✅ PASS' if result['pass'] else '❌ FAIL'}")
    print(json.dumps(result, indent=2))
    return result

# ── Journey B: Gallery locked spec ───────────────────────────────────────────
def run_journey_b():
    print("\n" + "="*60)
    print("JOURNEY B: Gallery locked spec (spacer) -> live job")
    print("="*60)
    # Spacer gallery preset: 20mm OD, 5mm ID, 15mm tall
    payload = {
        "intake_family_candidate": "spacer",
        "intake_dimensions": {
            "outer_diameter": 20,
            "inner_diameter": 5,
            "length": 15
        },
        "locked_spec": True,
        "source": "gallery_locked_preset",
    }
    print(f"POST {PROD_URL}/api/invent")
    print(f"Payload: {json.dumps(payload)}")
    r = requests.post(
        f"{PROD_URL}/api/invent",
        headers=BYPASS_HEADERS,
        json=payload,
        timeout=30
    )
    print(f"HTTP {r.status_code}")
    print(f"Headers: x-commit-sha={r.headers.get('x-commit-sha','N/A')}")

    if r.status_code not in (200, 201):
        print(f"❌ FAILED: {r.text[:500]}")
        return {"pass": False, "error": r.text[:500], "status": r.status_code}

    data = r.json()
    job_id = data.get("job_id") or data.get("id")
    family = data.get("family") or data.get("requested_family")
    print(f"job_id: {job_id}")
    print(f"family: {family}")

    if not job_id:
        return {"pass": False, "error": "No job_id", "data": data}

    job_row = wait_for_job(job_id)
    cad_runs = get_cad_runs(job_id)
    storage = check_storage(job_id)

    family_correct = family == "spacer" or job_row.get("requested_family") == "spacer"
    has_cad_run = len(cad_runs) > 0 and "error" not in cad_runs[0]

    result = {
        "pass": family_correct and has_cad_run,
        "job_id": job_id,
        "family": family,
        "family_correct": family_correct,
        "job_status": job_row.get("status"),
        "cad_run_count": len(cad_runs),
        "cad_run_status": cad_runs[0].get("status") if cad_runs else None,
        "storage": storage,
    }
    print(f"\nJourney B result: {'✅ PASS' if result['pass'] else '❌ FAIL'}")
    print(json.dumps(result, indent=2))
    return result

# ── Journey C: Artemis demo ───────────────────────────────────────────────────
def run_journey_c():
    print("\n" + "="*60)
    print("JOURNEY C: Artemis demo -> live job")
    print("="*60)
    print(f"POST {PROD_URL}/api/demo/artemis")
    r = requests.post(
        f"{PROD_URL}/api/demo/artemis",
        headers=BYPASS_HEADERS,
        json={},
        timeout=30
    )
    print(f"HTTP {r.status_code}")
    print(f"Headers: x-commit-sha={r.headers.get('x-commit-sha','N/A')}")

    if r.status_code not in (200, 201):
        print(f"❌ FAILED: {r.text[:500]}")
        return {"pass": False, "error": r.text[:500], "status": r.status_code}

    data = r.json()
    job_id = data.get("job_id") or data.get("id")
    family = data.get("family") or data.get("requested_family")
    print(f"job_id: {job_id}")
    print(f"family: {family}")
    print(f"Full response: {json.dumps(data, indent=2)[:500]}")

    if not job_id:
        return {"pass": False, "error": "No job_id", "data": data}

    job_row = wait_for_job(job_id)
    cad_runs = get_cad_runs(job_id)
    storage = check_storage(job_id)

    family_correct = family == "spacer" or job_row.get("requested_family") == "spacer"
    has_cad_run = len(cad_runs) > 0 and "error" not in cad_runs[0]

    result = {
        "pass": family_correct and has_cad_run,
        "job_id": job_id,
        "family": family,
        "family_correct": family_correct,
        "job_status": job_row.get("status"),
        "cad_run_count": len(cad_runs),
        "cad_run_status": cad_runs[0].get("status") if cad_runs else None,
        "storage": storage,
    }
    print(f"\nJourney C result: {'✅ PASS' if result['pass'] else '❌ FAIL'}")
    print(json.dumps(result, indent=2))
    return result

# ── Run probe ────────────────────────────────────────────────────────────────
def run_probe():
    print("\n" + "="*60)
    print("PROBE: /api/probe normalizer verification")
    print("="*60)
    r = requests.get(
        f"{PROD_URL}/api/probe",
        headers={"X-Admin-Bypass-Key": ADMIN_BYPASS_KEY or ""},
        timeout=15
    )
    print(f"HTTP {r.status_code}")
    if r.status_code == 200:
        data = r.json()
        print(f"status: {data.get('status')}")
        print(f"commit_sha: {data.get('deployment', {}).get('commit_sha')}")
        print(f"all_tests_pass: {data.get('normalizer', {}).get('all_tests_pass')}")
        print(f"pass_count: {data.get('normalizer', {}).get('pass_count')}/{data.get('normalizer', {}).get('total_count')}")
        for name, t in data.get("normalizer", {}).get("tests", {}).items():
            icon = "✅" if t.get("pass") else "❌"
            print(f"  {icon} {name}: family={t.get('got_family')}, params={t.get('got_params')}")
        return data
    else:
        print(f"❌ FAILED: {r.text[:500]}")
        return {"error": r.status_code}

# ── Main ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    # Wait for deployment
    deployed = wait_for_deployment(max_wait=480)
    if not deployed:
        print("Proceeding anyway (deployment may be live on different SHA)...")

    # Run probe first
    probe = run_probe()

    # Run all 3 journeys
    a = run_journey_a()
    b = run_journey_b()
    c = run_journey_c()

    # Summary
    print("\n" + "="*60)
    print("FINAL SUMMARY")
    print("="*60)
    print(f"Probe:     {'✅ ALL_PASS' if probe.get('normalizer', {}).get('all_tests_pass') else '❌ SOME_FAIL'}")
    print(f"Journey A: {'✅ PASS' if a.get('pass') else '❌ FAIL'} — job_id={a.get('job_id','N/A')}, family={a.get('family','N/A')}, cad_run={a.get('cad_run_status','N/A')}")
    print(f"Journey B: {'✅ PASS' if b.get('pass') else '❌ FAIL'} — job_id={b.get('job_id','N/A')}, family={b.get('family','N/A')}, cad_run={b.get('cad_run_status','N/A')}")
    print(f"Journey C: {'✅ PASS' if c.get('pass') else '❌ FAIL'} — job_id={c.get('job_id','N/A')}, family={c.get('family','N/A')}, cad_run={c.get('cad_run_status','N/A')}")

    all_pass = (
        probe.get("normalizer", {}).get("all_tests_pass", False) and
        a.get("pass", False) and
        b.get("pass", False) and
        c.get("pass", False)
    )
    print(f"\nOVERALL: {'✅ ALL PASS' if all_pass else '❌ SOME FAILURES'}")

    # Save results
    results = {
        "commit": TARGET_COMMIT,
        "probe": probe,
        "journey_a": a,
        "journey_b": b,
        "journey_c": c,
        "all_pass": all_pass,
    }
    with open("/home/ubuntu/le-repo/scripts/live_proof_results.json", "w") as f:
        json.dump(results, f, indent=2, default=str)
    print("\nResults saved to scripts/live_proof_results.json")
    sys.exit(0 if all_pass else 1)
