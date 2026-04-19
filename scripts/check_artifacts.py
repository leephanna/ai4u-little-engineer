"""
Check artifacts in Supabase storage for specific cad_runs and jobs.
"""
import requests
import json
import os

SUPABASE_URL = "https://lphtdosxneplxgkygjom.supabase.co"
VERCEL_TOKEN = os.environ.get("VERCEL_TOKEN", "")
TEAM_ID = "team_tijiRx4i1cQPPiNUA5HJFxOE"
PROJECT_ID = "prj_ypBKnm0KbFrWqxwvJ0SkAe5RJOnF"

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

SB_HEADERS = {
    "apikey": service_key,
    "Authorization": f"Bearer {service_key}",
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Accept-Profile": "public",
}

STORAGE_HEADERS = {
    "apikey": service_key,
    "Authorization": f"Bearer {service_key}",
    "Content-Type": "application/json",
}

# Check the successful Artemis cad_run
print("=== Artemis cad_run bde176ae ===")
r = requests.get(
    f"{SUPABASE_URL}/rest/v1/cad_runs?id=eq.bde176ae-d0af-42ea-9892-34b801860ad4&select=*",
    headers=SB_HEADERS, timeout=15
)
if r.status_code == 200 and r.json():
    run = r.json()[0]
    print(json.dumps(run, indent=2, default=str)[:3000])
else:
    print(f"HTTP {r.status_code}: {r.text[:200]}")

# List storage objects with prefix
print("\n=== Storage: cad-artifacts bucket (all objects) ===")
for prefix in ["", "stl/", "jobs/", "cad/", "artifacts/"]:
    r2 = requests.post(
        f"{SUPABASE_URL}/storage/v1/object/list/cad-artifacts",
        headers=STORAGE_HEADERS,
        json={"prefix": prefix, "limit": 20, "offset": 0},
        timeout=15
    )
    if r2.status_code == 200:
        objects = r2.json()
        if objects:
            print(f"  prefix='{prefix}': {len(objects)} objects")
            for obj in objects[:5]:
                print(f"    {obj.get('name', 'N/A')} | {obj.get('metadata', {}).get('size', 'N/A')} bytes")
            break
    else:
        print(f"  prefix='{prefix}': HTTP {r2.status_code}")

# Check if there's an artifact_url or output_file in the successful cad_run
print("\n=== Check cad_runs for artifact fields ===")
r3 = requests.get(
    f"{SUPABASE_URL}/rest/v1/cad_runs?status=eq.success&select=id,job_id,status,output_stl_key,artifact_url,result_json,generator_name&limit=5",
    headers=SB_HEADERS, timeout=15
)
print(f"HTTP {r3.status_code}")
if r3.status_code == 200:
    runs = r3.json()
    for run in runs:
        print(json.dumps(run, indent=2, default=str)[:500])
else:
    print(f"Error: {r3.text[:300]}")

# Check what columns cad_runs actually has
print("\n=== cad_runs columns (via single row) ===")
r4 = requests.get(
    f"{SUPABASE_URL}/rest/v1/cad_runs?limit=1",
    headers=SB_HEADERS, timeout=15
)
print(f"HTTP {r4.status_code}")
if r4.status_code == 200 and r4.json():
    print(f"Columns: {list(r4.json()[0].keys())}")

# Check jobs columns
print("\n=== jobs columns (via single row) ===")
r5 = requests.get(
    f"{SUPABASE_URL}/rest/v1/jobs?limit=1",
    headers=SB_HEADERS, timeout=15
)
print(f"HTTP {r5.status_code}")
if r5.status_code == 200 and r5.json():
    print(f"Columns: {list(r5.json()[0].keys())}")

# Check if there's a job_artifacts or artifacts table
print("\n=== Check for artifact-related tables ===")
for table in ["job_artifacts", "stl_files", "output_files", "cad_outputs"]:
    r6 = requests.get(
        f"{SUPABASE_URL}/rest/v1/{table}?limit=1",
        headers=SB_HEADERS, timeout=10
    )
    print(f"  {table}: HTTP {r6.status_code}")
    if r6.status_code == 200:
        print(f"    Found! Columns: {list(r6.json()[0].keys()) if r6.json() else 'empty'}")
