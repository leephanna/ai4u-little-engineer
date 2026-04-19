"""
Full End-to-End Live Production Audit
======================================
Pre-flight + DB audit + Journey execution via API
"""
import requests
import json
import time
import os
import sys

ADMIN_BYPASS_KEY = "891p-JU7zTvLfTAGO0we9S9LQd1wKjW33AJYILqQrhk"
BASE_URL = "https://ai4u-little-engineer-web.vercel.app"
VERCEL_TOKEN = os.environ.get("VERCEL_TOKEN", "")
TEAM_ID = "team_tijiRx4i1cQPPiNUA5HJFxOE"
PROJECT_ID = "prj_ypBKnm0KbFrWqxwvJ0SkAe5RJOnF"

PROBE_HEADERS = {
    "x-admin-bypass-key": ADMIN_BYPASS_KEY,
    "Content-Type": "application/json",
    "Accept": "application/json",
}

VERCEL_HEADERS = {"Authorization": f"Bearer {VERCEL_TOKEN}"}

findings = {}

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

# ─── PRE-FLIGHT ──────────────────────────────────────────────────────────────

section("PRE-FLIGHT A: Live deployment identity via /api/probe")
r = requests.get(f"{BASE_URL}/api/probe", headers=PROBE_HEADERS, timeout=30)
print(f"HTTP {r.status_code} | x-vercel-id: {r.headers.get('x-vercel-id', 'N/A')}")
probe_body = r.json() if r.status_code == 200 else {}
live_commit = probe_body.get("deployment", {}).get("commit_sha", "N/A")
live_dep_id_probe = probe_body.get("deployment", {}).get("deployment_id", "N/A")
live_env = probe_body.get("deployment", {}).get("vercel_env", "N/A")
live_region = probe_body.get("deployment", {}).get("vercel_region", "N/A")
print(f"  commit_sha:    {live_commit}")
print(f"  deployment_id: {live_dep_id_probe}")
print(f"  vercel_env:    {live_env}")
print(f"  vercel_region: {live_region}")
findings["preflight_commit"] = live_commit
findings["preflight_dep_id"] = live_dep_id_probe

section("PRE-FLIGHT B: Vercel production alias confirmation")
r2 = requests.get(
    f"https://api.vercel.com/v9/projects/{PROJECT_ID}?teamId={TEAM_ID}",
    headers=VERCEL_HEADERS, timeout=15
)
proj = r2.json()
prod_target = proj.get("targets", {}).get("production", {})
vercel_commit = prod_target.get("meta", {}).get("githubCommitSha", "N/A")
vercel_dep_id = prod_target.get("id", "N/A")
vercel_state = prod_target.get("readyState", "N/A")
vercel_url = prod_target.get("url", "N/A")
print(f"  Vercel prod deployment ID: {vercel_dep_id}")
print(f"  Vercel prod commit SHA:    {vercel_commit}")
print(f"  Vercel prod state:         {vercel_state}")
print(f"  Vercel prod URL:           {vercel_url}")
alias_match = vercel_commit == live_commit
check("Probe commit == Vercel prod commit", alias_match,
      f"probe={live_commit[:12]} vercel={vercel_commit[:12]}")
findings["alias_match"] = alias_match
findings["vercel_dep_id"] = vercel_dep_id
findings["vercel_commit"] = vercel_commit

# ─── SUPABASE DIRECT QUERY ───────────────────────────────────────────────────

section("PRE-FLIGHT C: Supabase DB connectivity check")
# Get Supabase URL and anon key from Vercel env
r_env = requests.get(
    f"https://api.vercel.com/v9/projects/{PROJECT_ID}/env?teamId={TEAM_ID}",
    headers=VERCEL_HEADERS, timeout=15
)
env_data = r_env.json()
envs = {e["key"]: e["id"] for e in env_data.get("envs", [])}

def get_env_value(key):
    env_id = envs.get(key)
    if not env_id:
        return None
    r = requests.get(
        f"https://api.vercel.com/v9/projects/{PROJECT_ID}/env/{env_id}?teamId={TEAM_ID}",
        headers=VERCEL_HEADERS, timeout=15
    )
    return r.json().get("value")

supabase_url = get_env_value("NEXT_PUBLIC_SUPABASE_URL")
supabase_service_key = get_env_value("SUPABASE_SERVICE_ROLE_KEY")
print(f"  Supabase URL: {supabase_url}")
print(f"  Service key: {'[found]' if supabase_service_key else '[NOT FOUND]'}")
findings["supabase_url"] = supabase_url
findings["supabase_key_found"] = bool(supabase_service_key)

# ─── JOURNEY A: CUBE via /api/intake/interpret + /api/invent ─────────────────

section("JOURNEY A: Cube → interpret → invent → job → DB check")
print("Step 1: POST /api/intake/interpret with cube prompt")

r_interp = requests.post(
    f"{BASE_URL}/api/intake/interpret",
    headers=PROBE_HEADERS,
    json={"text": "Just make a cube with 5mm sides. Don't ask for clarification, just make a cube."},
    timeout=30,
)
print(f"HTTP {r_interp.status_code}")
print(f"x-commit-sha:      {r_interp.headers.get('x-commit-sha', 'N/A')}")
print(f"x-source:          {r_interp.headers.get('x-source', 'N/A')}")
print(f"x-llm-bypassed:    {r_interp.headers.get('x-llm-bypassed', 'N/A')}")
print(f"x-primitive-family:{r_interp.headers.get('x-primitive-family', 'N/A')}")

interp_body = r_interp.json() if r_interp.status_code == 200 else {}
print(f"\nInterpret response:")
print(json.dumps(interp_body, indent=2)[:1000])

session_id = interp_body.get("session_id")
family = interp_body.get("family_candidate")
dims = interp_body.get("extracted_dimensions", {})
is_primitive = interp_body.get("is_primitive")
missing = interp_body.get("missing_information", [])

findings["journey_a_interpret_status"] = r_interp.status_code
findings["journey_a_family"] = family
findings["journey_a_dims"] = dims
findings["journey_a_is_primitive"] = is_primitive
findings["journey_a_missing"] = missing
findings["journey_a_session_id"] = session_id

check("interpret HTTP 200", r_interp.status_code == 200)
check("family = standoff_block", family == "standoff_block", f"got: {family}")
check("is_primitive = true", is_primitive == True)
check("no missing_information", len(missing) == 0, f"missing: {missing}")
check("LLM bypassed", r_interp.headers.get("x-llm-bypassed") == "true")

print(f"\nStep 2: POST /api/invent with locked spec")
# Now call /api/invent with the interpreted spec
invent_payload = {
    "session_id": session_id,
    "family": family,
    "dimensions": dims,
    "is_primitive": is_primitive,
    "prompt": "Just make a cube with 5mm sides. Don't ask for clarification, just make a cube.",
}
print(f"Payload: {json.dumps(invent_payload, indent=2)}")

r_invent = requests.post(
    f"{BASE_URL}/api/invent",
    headers=PROBE_HEADERS,
    json=invent_payload,
    timeout=30,
)
print(f"\nHTTP {r_invent.status_code}")
invent_body = r_invent.json() if r_invent.headers.get("content-type", "").startswith("application/json") else {}
print(f"Response:")
print(json.dumps(invent_body, indent=2)[:2000])

job_id_a = invent_body.get("jobId") or invent_body.get("job_id") or invent_body.get("id")
findings["journey_a_invent_status"] = r_invent.status_code
findings["journey_a_job_id"] = job_id_a
print(f"\nJob ID: {job_id_a}")
check("invent HTTP 200 or 201", r_invent.status_code in (200, 201), f"got: {r_invent.status_code}")
check("job_id present", bool(job_id_a), f"got: {job_id_a}")

# ─── JOURNEY C: ARTEMIS DEMO ──────────────────────────────────────────────────

section("JOURNEY C: Artemis demo → POST /api/demo/artemis")
artemis_payload = {"scale": "medium", "material": "PLA", "quality": "standard"}
print(f"Payload: {json.dumps(artemis_payload)}")

r_artemis = requests.post(
    f"{BASE_URL}/api/demo/artemis",
    headers=PROBE_HEADERS,
    json=artemis_payload,
    timeout=30,
)
print(f"\nHTTP {r_artemis.status_code}")
artemis_body = r_artemis.json() if r_artemis.headers.get("content-type", "").startswith("application/json") else {}
print(f"Response:")
print(json.dumps(artemis_body, indent=2)[:2000])

job_id_c = artemis_body.get("jobId") or artemis_body.get("job_id") or artemis_body.get("id")
findings["journey_c_status"] = r_artemis.status_code
findings["journey_c_job_id"] = job_id_c
print(f"\nJob ID: {job_id_c}")
check("artemis HTTP 200", r_artemis.status_code == 200, f"got: {r_artemis.status_code}")
check("job_id present", bool(job_id_c), f"got: {job_id_c}")

# ─── DB CHECK via Supabase REST ───────────────────────────────────────────────

section("DB CHECK: Query Supabase for job rows")
if supabase_url and supabase_service_key:
    sb_headers = {
        "apikey": supabase_service_key,
        "Authorization": f"Bearer {supabase_service_key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    for label, jid in [("Journey A", job_id_a), ("Journey C", job_id_c)]:
        if not jid:
            print(f"  {label}: no job_id to query")
            continue
        r_job = requests.get(
            f"{supabase_url}/rest/v1/jobs?id=eq.{jid}&select=id,status,title,requested_family,selected_family,confidence_score,truth_label,latest_run_id,created_at",
            headers=sb_headers, timeout=15
        )
        print(f"\n  {label} job row (HTTP {r_job.status_code}):")
        jobs = r_job.json() if r_job.status_code == 200 else []
        if jobs:
            print(json.dumps(jobs[0], indent=4))
            findings[f"{label.lower().replace(' ', '_')}_job_row"] = jobs[0]
            run_id = jobs[0].get("latest_run_id")
            if run_id:
                r_run = requests.get(
                    f"{supabase_url}/rest/v1/cad_runs?id=eq.{run_id}&select=id,status,engine,generator_name,error_text,started_at,ended_at",
                    headers=sb_headers, timeout=15
                )
                print(f"\n  {label} cad_run row (HTTP {r_run.status_code}):")
                runs = r_run.json() if r_run.status_code == 200 else []
                if runs:
                    print(json.dumps(runs[0], indent=4))
                    findings[f"{label.lower().replace(' ', '_')}_cad_run"] = runs[0]
        else:
            print(f"  No job found for id={jid}")
else:
    print("  SKIP: Supabase credentials not available")

# ─── SUMMARY ─────────────────────────────────────────────────────────────────

section("AUDIT SUMMARY")
print(json.dumps(findings, indent=2, default=str)[:4000])
