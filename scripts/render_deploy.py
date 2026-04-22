"""
Find the ai4u-cad-worker Render service and trigger a redeploy.
Then wait for it to come up with solid_block support.
"""
import requests
import json
import time
import sys

RENDER_API_KEY = "rnd_6bw8dnTsbbua5IpBNJROIaWXu39M"
CAD_WORKER_URL = "https://ai4u-cad-worker.onrender.com"
RH = {
    "Authorization": f"Bearer {RENDER_API_KEY}",
    "Accept": "application/json",
}

# ── Find the service ──────────────────────────────────────────────────────────
print("Listing Render services...")
r = requests.get("https://api.render.com/v1/services?limit=20", headers=RH, timeout=15)
print(f"HTTP {r.status_code}")
if r.status_code != 200:
    print(f"Error: {r.text[:300]}")
    sys.exit(1)

services = r.json()
print(f"Found {len(services)} services:")
target_service_id = None
for svc in services:
    s = svc.get("service", svc)
    name = s.get("name", "")
    svc_id = s.get("id", "")
    svc_url = s.get("serviceDetails", {}).get("url", "") or s.get("url", "")
    print(f"  {name} | {svc_id} | {svc_url}")
    if "cad-worker" in name.lower() or "cad_worker" in name.lower():
        target_service_id = svc_id
        print(f"  ^^^ TARGET FOUND: {svc_id}")

if not target_service_id:
    print("CAD worker service not found by name. Trying URL match...")
    for svc in services:
        s = svc.get("service", svc)
        svc_url = s.get("serviceDetails", {}).get("url", "") or s.get("url", "")
        if "cad-worker" in svc_url.lower():
            target_service_id = s.get("id")
            print(f"Found by URL: {target_service_id}")
            break

if not target_service_id:
    print("ERROR: Could not find the CAD worker service on Render.")
    sys.exit(1)

# ── Trigger redeploy ──────────────────────────────────────────────────────────
print(f"\nTriggering redeploy for service {target_service_id}...")
r2 = requests.post(
    f"https://api.render.com/v1/services/{target_service_id}/deploys",
    headers=RH,
    json={"clearCache": "do_not_clear"},
    timeout=15
)
print(f"HTTP {r2.status_code}")
print(f"Response: {r2.text[:400]}")

if r2.status_code not in (200, 201):
    print("ERROR: Failed to trigger redeploy.")
    sys.exit(1)

deploy_id = r2.json().get("id") or r2.json().get("deploy", {}).get("id")
print(f"Deploy ID: {deploy_id}")

# ── Poll for deploy completion ────────────────────────────────────────────────
print(f"\nPolling deploy status (max 20 min)...")
start = time.time()
max_wait = 1200
while time.time() - start < max_wait:
    elapsed = int(time.time() - start)
    
    # Check deploy status
    if deploy_id:
        r_dep = requests.get(
            f"https://api.render.com/v1/services/{target_service_id}/deploys/{deploy_id}",
            headers=RH, timeout=15
        )
        if r_dep.status_code == 200:
            dep = r_dep.json()
            status = dep.get("status", "unknown")
            print(f"  [{elapsed}s] Deploy status: {status}")
            if status in ("live", "succeeded"):
                print(f"✅ Deploy succeeded!")
                break
            elif status in ("failed", "canceled", "deactivated"):
                print(f"❌ Deploy failed: {status}")
                print(f"Details: {json.dumps(dep, indent=2)[:500]}")
                break
    
    # Also check if solid_block is now supported
    try:
        r_test = requests.post(
            f"{CAD_WORKER_URL}/generate",
            json={
                "part_spec_id": "probe-test-001",
                "part_spec": {"family": "solid_block", "dimensions": {"length": 5, "width": 5, "height": 5}},
                "cad_run_id": "probe-test-001",
                "job_id": "probe-test-001"
            },
            timeout=15
        )
        if "Unsupported part family" not in r_test.text:
            print(f"  [{elapsed}s] ✅ solid_block now supported by CAD worker!")
            break
    except Exception as e:
        print(f"  [{elapsed}s] CAD worker probe error: {e}")
    
    time.sleep(30)

# ── Final check ───────────────────────────────────────────────────────────────
print("\n--- Final CAD worker check ---")
r_health = requests.get(f"{CAD_WORKER_URL}/health", timeout=15)
print(f"Health: {r_health.text[:200]}")

r_test = requests.post(
    f"{CAD_WORKER_URL}/generate",
    json={
        "part_spec_id": "probe-test-final",
        "part_spec": {"family": "solid_block", "dimensions": {"length": 5, "width": 5, "height": 5}},
        "cad_run_id": "probe-test-final",
        "job_id": "probe-test-final"
    },
    timeout=30
)
if "Unsupported part family" in r_test.text:
    print(f"❌ solid_block still NOT supported: {r_test.text[:200]}")
    supported = False
else:
    print(f"✅ solid_block IS supported! HTTP {r_test.status_code}: {r_test.text[:200]}")
    supported = True

print(f"\nCAD worker solid_block support: {'✅ YES' if supported else '❌ NO'}")
sys.exit(0 if supported else 1)
