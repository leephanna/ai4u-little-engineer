"""
Check artifacts in Supabase storage - fixed version.
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

# List all storage objects
print("=== Storage: cad-artifacts bucket (all objects with prefix='') ===")
r2 = requests.post(
    f"{SUPABASE_URL}/storage/v1/object/list/cad-artifacts",
    headers=STORAGE_HEADERS,
    json={"prefix": "", "limit": 50, "offset": 0},
    timeout=15
)
print(f"HTTP {r2.status_code}")
if r2.status_code == 200:
    objects = r2.json()
    print(f"Found {len(objects)} objects:")
    for obj in objects:
        name = obj.get('name', 'N/A')
        meta = obj.get('metadata') or {}
        size = meta.get('size', 'N/A') if isinstance(meta, dict) else 'N/A'
        created = obj.get('created_at', 'N/A')
        print(f"  {name} | {size} bytes | {created}")
else:
    print(f"Error: {r2.text[:500]}")

# Check cad_runs columns
print("\n=== cad_runs columns ===")
r4 = requests.get(
    f"{SUPABASE_URL}/rest/v1/cad_runs?limit=1",
    headers=SB_HEADERS, timeout=15
)
if r4.status_code == 200 and r4.json():
    print(f"Columns: {list(r4.json()[0].keys())}")

# Check jobs columns
print("\n=== jobs columns ===")
r5 = requests.get(
    f"{SUPABASE_URL}/rest/v1/jobs?limit=1",
    headers=SB_HEADERS, timeout=15
)
if r5.status_code == 200 and r5.json():
    print(f"Columns: {list(r5.json()[0].keys())}")

# Check successful cad_runs for artifact fields
print("\n=== Successful cad_runs (full row) ===")
r6 = requests.get(
    f"{SUPABASE_URL}/rest/v1/cad_runs?status=eq.success&limit=3",
    headers=SB_HEADERS, timeout=15
)
if r6.status_code == 200:
    for run in r6.json():
        print(json.dumps(run, indent=2, default=str))
        print()

# Check the Artemis job full row
print("\n=== Artemis job full row ===")
r7 = requests.get(
    f"{SUPABASE_URL}/rest/v1/jobs?id=eq.1b4f5ed3-4ee5-4111-a8a3-5c11e807c177",
    headers=SB_HEADERS, timeout=15
)
if r7.status_code == 200 and r7.json():
    print(json.dumps(r7.json()[0], indent=2, default=str))
