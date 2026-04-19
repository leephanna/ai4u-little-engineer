"""
Fixed Supabase DB Query
========================
Uses correct Accept-Profile header to target public schema.
"""
import requests
import json
import os

SUPABASE_URL = "https://lphtdosxneplxgkygjom.supabase.co"
VERCEL_TOKEN = os.environ.get("VERCEL_TOKEN", "")
TEAM_ID = "team_tijiRx4i1cQPPiNUA5HJFxOE"
PROJECT_ID = "prj_ypBKnm0KbFrWqxwvJ0SkAe5RJOnF"

# Get service key from Vercel
VERCEL_HEADERS = {"Authorization": f"Bearer {VERCEL_TOKEN}"}
r_env = requests.get(
    f"https://api.vercel.com/v9/projects/{PROJECT_ID}/env?teamId={TEAM_ID}",
    headers=VERCEL_HEADERS, timeout=15
)
envs = {e["key"]: e["id"] for e in r_env.json().get("envs", [])}

def get_env_value(key):
    env_id = envs.get(key)
    if not env_id:
        return None
    r = requests.get(
        f"https://api.vercel.com/v9/projects/{PROJECT_ID}/env/{env_id}?teamId={TEAM_ID}",
        headers=VERCEL_HEADERS, timeout=15
    )
    return r.json().get("value")

service_key = get_env_value("SUPABASE_SERVICE_ROLE_KEY")
print(f"Service key: {'[found]' if service_key else '[NOT FOUND]'}")

# Correct headers: use Accept-Profile to target public schema
SB_HEADERS = {
    "apikey": service_key,
    "Authorization": f"Bearer {service_key}",
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Accept-Profile": "public",  # ← This is the fix
}

# Test 1: List jobs
print("\n=== Jobs (last 10) ===")
r = requests.get(
    f"{SUPABASE_URL}/rest/v1/jobs?select=id,status,title,requested_family,clerk_user_id,created_at&order=created_at.desc&limit=10",
    headers=SB_HEADERS, timeout=15
)
print(f"HTTP {r.status_code}")
if r.status_code == 200:
    jobs = r.json()
    print(f"Found {len(jobs)} jobs:")
    for j in jobs:
        print(f"  {j.get('id', 'N/A')} | {j.get('status', 'N/A')} | {j.get('requested_family', 'N/A')} | {j.get('clerk_user_id', 'N/A')[:20]} | {j.get('title', 'N/A')[:40]}")
else:
    print(f"Error: {r.text[:500]}")

# Test 2: List cad_runs
print("\n=== CAD Runs (last 10) ===")
r2 = requests.get(
    f"{SUPABASE_URL}/rest/v1/cad_runs?select=id,job_id,status,engine,generator_name,error_text,started_at,ended_at&order=started_at.desc&limit=10",
    headers=SB_HEADERS, timeout=15
)
print(f"HTTP {r2.status_code}")
if r2.status_code == 200:
    runs = r2.json()
    print(f"Found {len(runs)} cad_runs:")
    for run in runs:
        print(f"  {run.get('id', 'N/A')} | {run.get('status', 'N/A')} | {run.get('generator_name', 'N/A')} | err={str(run.get('error_text', 'N/A'))[:60]}")
else:
    print(f"Error: {r2.text[:500]}")

# Test 3: Specific Artemis job
print("\n=== Artemis Job ===")
artemis_job_id = "1b4f5ed3-4ee5-4111-a8a3-5c11e807c177"
r3 = requests.get(
    f"{SUPABASE_URL}/rest/v1/jobs?id=eq.{artemis_job_id}&select=*",
    headers=SB_HEADERS, timeout=15
)
print(f"HTTP {r3.status_code}")
if r3.status_code == 200:
    data = r3.json()
    if data:
        print(json.dumps(data[0], indent=2, default=str)[:2000])
    else:
        print("  No rows found for this job ID")
else:
    print(f"Error: {r3.text[:500]}")

# Test 4: Storage bucket objects
print("\n=== Storage bucket: cad-artifacts (last 10 objects) ===")
r4 = requests.post(
    f"{SUPABASE_URL}/storage/v1/object/list/cad-artifacts",
    headers={**SB_HEADERS, "Content-Type": "application/json"},
    json={"limit": 10, "offset": 0, "sortBy": {"column": "created_at", "order": "desc"}},
    timeout=15
)
print(f"HTTP {r4.status_code}")
if r4.status_code == 200:
    objects = r4.json()
    print(f"Found {len(objects)} objects:")
    for obj in objects:
        print(f"  {obj.get('name', 'N/A')} | {obj.get('metadata', {}).get('size', 'N/A')} bytes | {obj.get('created_at', 'N/A')}")
else:
    print(f"Error: {r4.text[:500]}")
