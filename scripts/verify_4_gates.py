#!/usr/bin/env python3
"""
4-Gate live verification script for AI4U Little Engineer.
V1: /api/probe → 200, all_tests_pass=true
V2: POST /api/invent with admin bypass → 200/201 with job_id
V3: CAD worker solid_block → 200, storage_path non-null
V4: Download route → not 500
"""
import requests, uuid, sys

BASE = "https://ai4u-little-engineer-web.vercel.app"
CAD  = "https://ai4u-cad-worker.onrender.com"
ADMIN_KEY = "891p-JU7zTvLfTAGO0we9S9LQd1wKjW33AJYILqQrhk"  # actual Vercel stored value (43 chars)

results = {}

# V1: Probe (no auth needed)
print("[V1] GET /api/probe")
r = requests.get(f"{BASE}/api/probe", timeout=15)
print(f"  Status: {r.status_code}")
if r.status_code == 200:
    d = r.json()
    commit = str(d.get('deployment', {}).get('commit_sha',''))[:12]
    # all_tests_pass is nested under normalizer
    atp = d.get('normalizer', {}).get('all_tests_pass')
    status = d.get('status')
    print(f"  commit_sha: {commit}")
    print(f"  status: {status}")
    print(f"  normalizer.all_tests_pass: {atp}")
    results["V1"] = status == 'ALL_PASS' and atp is True
else:
    print(f"  Body: {r.text[:300]}")
    results["V1"] = False

# V2: invent with admin bypass
print("\n[V2] POST /api/invent (admin bypass)")
spec = {
    "text": "Gallery preset: M3 spacer 5mm tall 20mm OD 10mm ID",
    "intake_family_candidate": "spacer",
    "intake_dimensions": {"outer_diameter": 20, "inner_diameter": 10, "length": 5},
    "locked_spec": True
}
r = requests.post(
    f"{BASE}/api/invent",
    json=spec,
    headers={"Content-Type": "application/json", "x-admin-bypass-key": ADMIN_KEY},
    timeout=30
)
print(f"  Status: {r.status_code}")
if r.status_code in (200, 201):
    d = r.json()
    job_id = d.get("job_id") or d.get("id")
    family = d.get("family") or d.get("requested_family")
    print(f"  job_id: {job_id}")
    print(f"  family: {family}")
    results["V2"] = job_id is not None
else:
    print(f"  Body: {r.text[:400]}")
    results["V2"] = False

# V3: CAD worker solid_block with correct job_id field
print("\n[V3] POST /generate solid_block (CAD worker)")
payload = {
    "job_id": str(uuid.uuid4()),
    "part_spec_id": str(uuid.uuid4()),
    "part_spec": {
        "family": "solid_block",
        "dimensions": {"length": 20, "width": 20, "height": 20}
    }
}
r = requests.post(f"{CAD}/generate", json=payload, timeout=60)
print(f"  Status: {r.status_code}")
if r.status_code == 200:
    d = r.json()
    print(f"  status: {d.get('status')}")
    arts = d.get("artifacts", [])
    if arts:
        sp = arts[0].get("storage_path")
        print(f"  storage_path: {str(sp)[:80] if sp else 'NULL'}")
        results["V3"] = sp is not None and len(str(sp)) > 0
    else:
        print(f"  body: {str(d)[:200]}")
        results["V3"] = False
else:
    print(f"  Body: {r.text[:300]}")
    results["V3"] = False

# V4: Download route — must not return 500
print("\n[V4] GET /api/artifacts/{fake_id}/download (no 500)")
fake_id = str(uuid.uuid4())
r = requests.get(
    f"{BASE}/api/artifacts/{fake_id}/download",
    headers={"x-admin-bypass-key": ADMIN_KEY},
    allow_redirects=False,
    timeout=15
)
print(f"  Status: {r.status_code}")
results["V4"] = r.status_code != 500

# Summary
print("\n" + "="*60)
all_pass = True
for k, v in results.items():
    s = "✓ PASS" if v else "✗ FAIL"
    print(f"  {s}  {k}")
    if not v:
        all_pass = False
print("="*60)
print(f"  STATUS: {'ALL PASS ✓' if all_pass else 'FAILURES DETECTED ✗'}")
sys.exit(0 if all_pass else 1)
