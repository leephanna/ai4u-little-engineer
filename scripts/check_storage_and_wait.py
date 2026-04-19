"""
Check Artemis job storage folder and wait for new deployment.
"""
import requests
import json
import os
import time

SUPABASE_URL = "https://lphtdosxneplxgkygjom.supabase.co"
VERCEL_TOKEN = os.environ.get("VERCEL_TOKEN", "")
TEAM_ID = "team_tijiRx4i1cQPPiNUA5HJFxOE"
PROJECT_ID = "prj_ypBKnm0KbFrWqxwvJ0SkAe5RJOnF"
ADMIN_BYPASS_KEY = "891p-JU7zTvLfTAGO0we9S9LQd1wKjW33AJYILqQrhk"
BASE_URL = "https://ai4u-little-engineer-web.vercel.app"
TARGET_COMMIT = "32e0ce8"

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

PROBE_HEADERS = {
    "x-admin-bypass-key": ADMIN_BYPASS_KEY,
    "Content-Type": "application/json",
    "Accept": "application/json",
}

# ─── Check Artemis job storage folder ────────────────────────────────────────
print("=" * 70)
print("CHECK: Artemis job storage folder")
print("=" * 70)
artemis_job_id = "1b4f5ed3-4ee5-4111-a8a3-5c11e807c177"
r = requests.post(
    f"{SUPABASE_URL}/storage/v1/object/list/cad-artifacts",
    headers=STORAGE_HEADERS,
    json={"prefix": artemis_job_id, "limit": 20, "offset": 0},
    timeout=15
)
print(f"HTTP {r.status_code}")
if r.status_code == 200:
    objects = r.json()
    print(f"Found {len(objects)} objects in folder '{artemis_job_id}':")
    for obj in objects:
        name = obj.get('name', 'N/A')
        meta = obj.get('metadata') or {}
        size = meta.get('size', 'N/A') if isinstance(meta, dict) else 'N/A'
        print(f"  {name} | {size} bytes")
        # Try to get a signed URL
        r_sign = requests.post(
            f"{SUPABASE_URL}/storage/v1/object/sign/cad-artifacts/{name}",
            headers=STORAGE_HEADERS,
            json={"expiresIn": 3600},
            timeout=10
        )
        if r_sign.status_code == 200:
            signed = r_sign.json().get("signedURL", "")
            print(f"    Signed URL: {SUPABASE_URL}/storage/v1{signed[:80]}...")
        else:
            print(f"    Sign error: {r_sign.status_code}")
else:
    print(f"Error: {r.text[:300]}")

# Also check a few other job folders
print("\n=== Check other job folders ===")
other_jobs = [
    "fb66c298-0f41-40b6-896c-41110adaeb6c",
    "1992351e-406f-44f5-98c7-82289c070e6c",  # standoff_block success
]
for jid in other_jobs:
    r2 = requests.post(
        f"{SUPABASE_URL}/storage/v1/object/list/cad-artifacts",
        headers=STORAGE_HEADERS,
        json={"prefix": jid, "limit": 10, "offset": 0},
        timeout=10
    )
    if r2.status_code == 200:
        objects = r2.json()
        print(f"  {jid}: {len(objects)} objects")
        for obj in objects:
            print(f"    {obj.get('name', 'N/A')}")

# ─── Wait for new deployment ──────────────────────────────────────────────────
print()
print("=" * 70)
print(f"WAITING FOR DEPLOYMENT: {TARGET_COMMIT}")
print("=" * 70)

max_wait = 300
start = time.time()
while time.time() - start < max_wait:
    r_proj = requests.get(
        f"https://api.vercel.com/v9/projects/{PROJECT_ID}?teamId={TEAM_ID}",
        headers=VERCEL_HEADERS, timeout=15
    )
    prod = r_proj.json().get("targets", {}).get("production", {})
    sha = prod.get("meta", {}).get("githubCommitSha", "")
    state = prod.get("readyState", "")
    elapsed = int(time.time() - start)
    print(f"[{elapsed:3d}s] sha={sha[:12]} state={state}")
    if sha.startswith(TARGET_COMMIT) and state == "READY":
        print(f"\n✓ Deployment READY: {sha}")
        break
    time.sleep(15)
else:
    print("TIMEOUT — probing anyway")

time.sleep(5)

# ─── Run Journey A: POST /api/invent with cube ────────────────────────────────
print()
print("=" * 70)
print("JOURNEY A: POST /api/invent (cube, admin bypass)")
print("=" * 70)

invent_payload = {
    "text": "Just make a cube with 5mm sides. Don't ask for clarification, just make a cube.",
}
print(f"Payload: {json.dumps(invent_payload)}")

r_inv = requests.post(
    f"{BASE_URL}/api/invent",
    headers=PROBE_HEADERS,
    json=invent_payload,
    timeout=60,
)
print(f"\nHTTP {r_inv.status_code}")
print(f"x-commit-sha: {r_inv.headers.get('x-commit-sha', 'N/A')}")

inv_body = {}
try:
    inv_body = r_inv.json()
    print(f"Response:")
    print(json.dumps(inv_body, indent=2, default=str)[:3000])
except:
    print(f"Raw: {r_inv.text[:500]}")

job_id_a = inv_body.get("job_id")
print(f"\nJob ID: {job_id_a}")

if job_id_a:
    # Query DB for the job
    print(f"\n=== DB: Job {job_id_a} ===")
    r_job = requests.get(
        f"{SUPABASE_URL}/rest/v1/jobs?id=eq.{job_id_a}",
        headers=SB_HEADERS, timeout=15
    )
    if r_job.status_code == 200 and r_job.json():
        print(json.dumps(r_job.json()[0], indent=2, default=str))
    
    # Query cad_run
    run_id = inv_body.get("cad_run_id")
    if run_id:
        print(f"\n=== DB: CAD Run {run_id} ===")
        r_run = requests.get(
            f"{SUPABASE_URL}/rest/v1/cad_runs?id=eq.{run_id}",
            headers=SB_HEADERS, timeout=15
        )
        if r_run.status_code == 200 and r_run.json():
            print(json.dumps(r_run.json()[0], indent=2, default=str))
        
        # Wait for CAD run to complete
        print(f"\nWaiting for CAD run to complete (max 120s)...")
        for i in range(24):
            time.sleep(5)
            r_run2 = requests.get(
                f"{SUPABASE_URL}/rest/v1/cad_runs?id=eq.{run_id}&select=id,status,error_text,ended_at",
                headers=SB_HEADERS, timeout=15
            )
            if r_run2.status_code == 200 and r_run2.json():
                run_data = r_run2.json()[0]
                print(f"  [{(i+1)*5}s] status={run_data.get('status')} error={run_data.get('error_text', 'N/A')}")
                if run_data.get("status") in ("success", "failed"):
                    print(f"\n  Final: {json.dumps(run_data, indent=2, default=str)}")
                    break
        
        # Check storage for artifact
        print(f"\n=== Storage: job folder {job_id_a} ===")
        r_stor = requests.post(
            f"{SUPABASE_URL}/storage/v1/object/list/cad-artifacts",
            headers=STORAGE_HEADERS,
            json={"prefix": job_id_a, "limit": 10, "offset": 0},
            timeout=15
        )
        if r_stor.status_code == 200:
            objects = r_stor.json()
            print(f"Found {len(objects)} objects:")
            for obj in objects:
                print(f"  {obj.get('name', 'N/A')}")
        else:
            print(f"Error: {r_stor.text[:200]}")
