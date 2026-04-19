"""
Supabase DB Diagnostic
========================
Find the correct table names and query format for jobs, cad_runs, artifacts.
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

SB_HEADERS = {
    "apikey": service_key,
    "Authorization": f"Bearer {service_key}",
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Prefer": "return=representation",
}

# Test 1: List all tables via information_schema
print("\n=== Test 1: List tables via information_schema ===")
r = requests.get(
    f"{SUPABASE_URL}/rest/v1/information_schema.tables?table_schema=eq.public&select=table_name",
    headers=SB_HEADERS, timeout=15
)
print(f"HTTP {r.status_code}")
if r.status_code == 200:
    tables = [t["table_name"] for t in r.json()]
    print(f"Tables: {tables}")
else:
    print(f"Error: {r.text[:200]}")

# Test 2: Query jobs table directly
print("\n=== Test 2: Query jobs table (last 5 rows) ===")
r2 = requests.get(
    f"{SUPABASE_URL}/rest/v1/jobs?select=id,status,title,requested_family,created_at&order=created_at.desc&limit=5",
    headers=SB_HEADERS, timeout=15
)
print(f"HTTP {r2.status_code}")
if r2.status_code == 200:
    jobs = r2.json()
    print(f"Found {len(jobs)} jobs:")
    for j in jobs:
        print(f"  {j.get('id', 'N/A')} | {j.get('status', 'N/A')} | {j.get('requested_family', 'N/A')} | {j.get('title', 'N/A')[:40]}")
else:
    print(f"Error: {r2.text[:500]}")

# Test 3: Query cad_runs table
print("\n=== Test 3: Query cad_runs table (last 5 rows) ===")
r3 = requests.get(
    f"{SUPABASE_URL}/rest/v1/cad_runs?select=id,job_id,status,engine,generator_name,error_text,started_at&order=started_at.desc&limit=5",
    headers=SB_HEADERS, timeout=15
)
print(f"HTTP {r3.status_code}")
if r3.status_code == 200:
    runs = r3.json()
    print(f"Found {len(runs)} cad_runs:")
    for r in runs:
        print(f"  {r.get('id', 'N/A')} | {r.get('status', 'N/A')} | {r.get('generator_name', 'N/A')} | err={r.get('error_text', 'N/A')}")
else:
    print(f"Error: {r3.text[:500]}")

# Test 4: Check if there's a storage/artifacts table
print("\n=== Test 4: Check storage/artifacts ===")
for table in ["artifacts", "cad_artifacts", "storage_objects", "files"]:
    r4 = requests.get(
        f"{SUPABASE_URL}/rest/v1/{table}?limit=1",
        headers=SB_HEADERS, timeout=10
    )
    print(f"  {table}: HTTP {r4.status_code}")
    if r4.status_code == 200:
        print(f"    Found! Sample: {r4.text[:200]}")

# Test 5: Check Supabase Storage buckets
print("\n=== Test 5: Supabase Storage buckets ===")
r5 = requests.get(
    f"{SUPABASE_URL}/storage/v1/bucket",
    headers=SB_HEADERS, timeout=15
)
print(f"HTTP {r5.status_code}")
if r5.status_code == 200:
    buckets = r5.json()
    print(f"Buckets: {[b.get('name') for b in buckets]}")
    for b in buckets:
        print(f"  {b.get('name')}: public={b.get('public')}")
else:
    print(f"Error: {r5.text[:200]}")

# Test 6: Query the specific Artemis job
print("\n=== Test 6: Query specific Artemis job ===")
artemis_job_id = "1b4f5ed3-4ee5-4111-a8a3-5c11e807c177"
r6 = requests.get(
    f"{SUPABASE_URL}/rest/v1/jobs?id=eq.{artemis_job_id}",
    headers=SB_HEADERS, timeout=15
)
print(f"HTTP {r6.status_code}")
print(f"Response: {r6.text[:500]}")
