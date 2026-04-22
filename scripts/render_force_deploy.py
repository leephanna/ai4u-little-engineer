"""
Check Render build logs and trigger a cache-cleared redeploy.
"""
import requests
import json
import time
import sys

RENDER_API_KEY = "rnd_6bw8dnTsbbua5IpBNJROIaWXu39M"
SERVICE_ID = "srv-d71u4m8ule4c73d3u16g"
CAD_WORKER_URL = "https://ai4u-cad-worker.onrender.com"
RH = {
    "Authorization": f"Bearer {RENDER_API_KEY}",
    "Accept": "application/json",
}

# ── Check last deploy logs ────────────────────────────────────────────────────
print("Checking last deploy...")
r = requests.get(
    f"https://api.render.com/v1/services/{SERVICE_ID}/deploys?limit=3",
    headers=RH, timeout=15
)
print(f"HTTP {r.status_code}")
deploys = r.json()
for dep in deploys[:3]:
    d = dep.get("deploy", dep)
    print(f"  id={d.get('id')} status={d.get('status')} commit={d.get('commit',{}).get('id','')[:10]} created={d.get('createdAt','')}")

# ── Check if Render is using the right Docker context ────────────────────────
print("\nChecking service config...")
r2 = requests.get(f"https://api.render.com/v1/services/{SERVICE_ID}", headers=RH, timeout=15)
print(f"HTTP {r2.status_code}")
svc = r2.json()
print(json.dumps(svc, indent=2)[:1000])

# ── Trigger a CLEAR CACHE redeploy ───────────────────────────────────────────
print("\nTriggering CLEAR CACHE redeploy...")
r3 = requests.post(
    f"https://api.render.com/v1/services/{SERVICE_ID}/deploys",
    headers=RH,
    json={"clearCache": "clear"},
    timeout=15
)
print(f"HTTP {r3.status_code}")
print(f"Response: {r3.text[:400]}")

if r3.status_code not in (200, 201):
    print("ERROR: Failed to trigger redeploy.")
    sys.exit(1)

deploy_id = r3.json().get("id")
print(f"Deploy ID: {deploy_id}")

# ── Poll for completion ───────────────────────────────────────────────────────
print(f"\nPolling deploy status (max 20 min)...")
start = time.time()
max_wait = 1200
while time.time() - start < max_wait:
    elapsed = int(time.time() - start)
    
    r_dep = requests.get(
        f"https://api.render.com/v1/services/{SERVICE_ID}/deploys/{deploy_id}",
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
            break
    
    # Check solid_block support
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
            print(f"  [{elapsed}s] ✅ solid_block now supported!")
            break
        else:
            # Show what families are supported
            import re
            m = re.search(r"Supported families: ([^'\"]+)", r_test.text)
            if m:
                print(f"  [{elapsed}s] Supported: {m.group(1)[:80]}")
    except Exception as e:
        print(f"  [{elapsed}s] CAD worker probe error: {e}")
    
    time.sleep(30)

# ── Final verification ────────────────────────────────────────────────────────
print("\n--- Final verification ---")
r_health = requests.get(f"{CAD_WORKER_URL}/health", timeout=15)
print(f"Health: {r_health.text[:200]}")

r_test = requests.post(
    f"{CAD_WORKER_URL}/generate",
    json={
        "part_spec_id": "probe-final",
        "part_spec": {"family": "solid_block", "dimensions": {"length": 5, "width": 5, "height": 5}},
        "cad_run_id": "probe-final",
        "job_id": "probe-final"
    },
    timeout=30
)
print(f"solid_block test HTTP {r_test.status_code}: {r_test.text[:300]}")
supported = "Unsupported part family" not in r_test.text
print(f"\nCAD worker solid_block support: {'✅ YES' if supported else '❌ NO'}")
sys.exit(0 if supported else 1)
