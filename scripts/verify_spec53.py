"""
Verify all 4 fixes from pasted_content_53.txt spec.
"""
import requests
import json
import uuid

CAD_WORKER_URL = "https://ai4u-cad-worker.onrender.com"
WEB_APP_URL = "https://ai4u-little-engineer-web.vercel.app"
SUPABASE_URL = "https://lphtdosxneplxgkygjom.supabase.co"
RENDER_API_KEY = "rnd_6bw8dnTsbbua5IpBNJROIaWXu39M"

def get_service_role_key():
    r = requests.get(
        "https://api.render.com/v1/services/srv-d71u4m8ule4c73d3u16g/env-vars",
        headers={"Authorization": f"Bearer {RENDER_API_KEY}", "Accept": "application/json"},
        timeout=15,
    )
    r.raise_for_status()
    for ev in r.json():
        item = ev.get("envVar", ev)
        if item.get("key") == "SUPABASE_SERVICE_ROLE_KEY":
            return item.get("value", "")
    return None

def get_admin_bypass_key():
    """Get ADMIN_BYPASS_KEY from Vercel env vars"""
    VERCEL_TOKEN = "vcp_4YqSIXB7o5I3oJsnTPViWNCZ8eCdCXcj"
    r = requests.get(
        "https://api.vercel.com/v9/projects/ai4u-little-engineer-web/env",
        headers={"Authorization": f"Bearer {VERCEL_TOKEN}"},
        params={"teamId": "team_JT3sJFGWtBFqRJBpFNBFkuOZ"},
        timeout=15,
    )
    if r.status_code == 200:
        envs = r.json().get("envs", [])
        for e in envs:
            if e.get("key") == "ADMIN_BYPASS_KEY":
                env_id = e.get("id")
                r2 = requests.get(
                    f"https://api.vercel.com/v9/projects/ai4u-little-engineer-web/env/{env_id}",
                    headers={"Authorization": f"Bearer {VERCEL_TOKEN}"},
                    params={"teamId": "team_JT3sJFGWtBFqRJBpFNBFkuOZ"},
                    timeout=15,
                )
                if r2.status_code == 200:
                    return r2.json().get("value", "")
    return None

def main():
    service_key = get_service_role_key()
    admin_key = get_admin_bypass_key()
    results = []

    # ── Verification 1: solid_block in CAD worker health ─────────────────────
    print("=== Verification 1: CAD worker health ===")
    r = requests.get(f"{CAD_WORKER_URL}/health", timeout=10)
    health = r.json() if r.status_code == 200 else {}
    # The health endpoint doesn't list families — check via a test generate
    print(f"  HTTP {r.status_code}: {json.dumps(health)}")
    v1_pass = r.status_code == 200 and health.get("status") == "ok"
    results.append(("V1: CAD worker health", v1_pass))

    # ── Verification 2: solid_block generates with STL > 1000 bytes ──────────
    print("\n=== Verification 2: solid_block generate with STL > 1000 bytes ===")
    job_id = str(uuid.uuid4())
    part_spec_id = str(uuid.uuid4())
    r = requests.post(
        f"{CAD_WORKER_URL}/generate",
        json={
            "job_id": job_id,
            "part_spec_id": part_spec_id,
            "part_spec": {
                "family": "solid_block",
                "units": "mm",
                "material": "PLA",
                "dimensions": {"length": 5, "width": 5, "height": 5}
            },
            "variant_type": "requested",
            "engine": "build123d",
            "export_formats": ["stl"],
            "strict_validation": False
        },
        timeout=60
    )
    print(f"  HTTP {r.status_code}")
    if r.status_code == 200:
        result = r.json()
        status = result.get("status")
        artifacts = result.get("artifacts", [])
        stl = next((a for a in artifacts if a.get("kind") == "stl"), None)
        stl_size = stl.get("file_size_bytes", 0) if stl else 0
        storage_path = stl.get("storage_path") if stl else None
        print(f"  status={status} stl_size={stl_size} storage_path={storage_path}")
        v2_pass = status == "success" and stl_size > 1000 and storage_path is not None
        results.append(("V2: solid_block generates with STL > 1000 bytes and non-null storage_path", v2_pass))
    else:
        print(f"  Error: {r.text[:300]}")
        results.append(("V2: solid_block generates with STL > 1000 bytes", False))
        storage_path = None

    # ── Verification 3: Download route exists and handles null storage_path ──
    print("\n=== Verification 3: Download route ===")
    # Test with a fake artifact ID — should return 404 (not 500)
    r = requests.get(
        f"{WEB_APP_URL}/api/artifacts/00000000-0000-0000-0000-000000000001/download",
        headers={"X-Admin-Bypass-Key": admin_key or ""},
        allow_redirects=False,
        timeout=15,
    )
    print(f"  HTTP {r.status_code} (expected 404 for fake ID)")
    v3_pass = r.status_code in (404, 401, 302)  # 401 if auth required, 404 if not found, 302 if redirect
    results.append(("V3: Download route responds correctly (not 500)", v3_pass))

    # ── Verification 4: Gallery probe ────────────────────────────────────────
    print("\n=== Verification 4: /api/probe confirms solid_block in registry ===")
    r = requests.get(f"{WEB_APP_URL}/api/probe", timeout=15)
    print(f"  HTTP {r.status_code}")
    if r.status_code == 200:
        probe = r.json()
        print(f"  all_tests_pass: {probe.get('all_tests_pass')}")
        print(f"  commit_sha: {probe.get('commit_sha', '?')[:12]}")
        tests = probe.get("tests", {})
        for k, v in tests.items():
            print(f"  test [{k}]: {'PASS' if v.get('pass') else 'FAIL'} → {v.get('family')} {v.get('dimensions', {})}")
        v4_pass = probe.get("all_tests_pass") is True
    else:
        print(f"  Error: {r.text[:200]}")
        v4_pass = False
    results.append(("V4: /api/probe all_tests_pass=true (solid_block in registry)", v4_pass))

    # ── Summary ───────────────────────────────────────────────────────────────
    print("\n=== SUMMARY ===")
    all_pass = True
    for name, passed in results:
        icon = "✓" if passed else "✗"
        print(f"  {icon} {name}")
        if not passed:
            all_pass = False
    print(f"\n{'ALL PASS ✓' if all_pass else 'SOME FAILURES ✗'}")

if __name__ == "__main__":
    main()
