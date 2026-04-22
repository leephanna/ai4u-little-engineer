"""
Get ADMIN_BYPASS_KEY from Vercel and test the probe endpoint.
"""
import requests
import json

VERCEL_TOKEN = "vcp_4YqSIXB7o5I3oJsnTPViWNCZ8eCdCXcj"
WEB_APP_URL = "https://ai4u-little-engineer-web.vercel.app"

def get_admin_bypass_key():
    # Try team-scoped first
    for team_id in ["team_JT3sJFGWtBFqRJBpFNBFkuOZ", None]:
        params = {}
        if team_id:
            params["teamId"] = team_id
        r = requests.get(
            "https://api.vercel.com/v9/projects/ai4u-little-engineer-web/env",
            headers={"Authorization": f"Bearer {VERCEL_TOKEN}"},
            params=params,
            timeout=15,
        )
        print(f"  List env HTTP {r.status_code} (teamId={team_id})")
        if r.status_code == 200:
            envs = r.json().get("envs", [])
            for e in envs:
                if e.get("key") == "ADMIN_BYPASS_KEY":
                    env_id = e.get("id")
                    print(f"  Found ADMIN_BYPASS_KEY id={env_id}")
                    r2 = requests.get(
                        f"https://api.vercel.com/v9/projects/ai4u-little-engineer-web/env/{env_id}",
                        headers={"Authorization": f"Bearer {VERCEL_TOKEN}"},
                        params=params,
                        timeout=15,
                    )
                    print(f"  Get env value HTTP {r2.status_code}")
                    if r2.status_code == 200:
                        val = r2.json().get("value", "")
                        print(f"  Value: {val[:20]}...")
                        return val
    return None

def main():
    print("=== Getting ADMIN_BYPASS_KEY ===")
    admin_key = get_admin_bypass_key()
    if not admin_key:
        print("ERROR: Could not get ADMIN_BYPASS_KEY")
        return

    print(f"\nAdmin key obtained: {admin_key[:20]}...")

    print("\n=== Testing /api/probe ===")
    r = requests.get(
        f"{WEB_APP_URL}/api/probe",
        headers={"x-admin-bypass-key": admin_key},
        timeout=15,
    )
    print(f"  HTTP {r.status_code}")
    if r.status_code == 200:
        data = r.json()
        print(f"  status: {data.get('status')}")
        print(f"  commit_sha: {data.get('deployment', {}).get('commit_sha', '?')[:12]}")
        normalizer = data.get("normalizer", {})
        print(f"  all_tests_pass: {normalizer.get('all_tests_pass')}")
        print(f"  pass_count: {normalizer.get('pass_count')}/{normalizer.get('total_count')}")
        tests = normalizer.get("tests", {})
        for k, v in tests.items():
            icon = "✓" if v.get("pass") else "✗"
            print(f"  {icon} {k}: family={v.get('got_family')} params={v.get('got_params')}")
    else:
        print(f"  Error: {r.text[:300]}")

    print("\n=== Testing solid_block generate (20mm cube) ===")
    import uuid
    from datetime import datetime
    CAD_WORKER_URL = "https://ai4u-cad-worker.onrender.com"
    RENDER_API_KEY = "rnd_6bw8dnTsbbua5IpBNJROIaWXu39M"

    r = requests.post(
        f"{CAD_WORKER_URL}/generate",
        json={
            "job_id": str(uuid.uuid4()),
            "part_spec_id": str(uuid.uuid4()),
            "part_spec": {
                "family": "solid_block",
                "units": "mm",
                "material": "PLA",
                "dimensions": {"length": 20, "width": 20, "height": 20}
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
        artifacts = result.get("artifacts", [])
        stl = next((a for a in artifacts if a.get("kind") == "stl"), None)
        stl_size = stl.get("file_size_bytes", 0) if stl else 0
        storage_path = stl.get("storage_path") if stl else None
        print(f"  status={result.get('status')} stl_size={stl_size} storage_path={storage_path}")
        if stl_size > 1000:
            print(f"  ✓ STL > 1000 bytes ({stl_size} bytes)")
        else:
            print(f"  ✗ STL <= 1000 bytes ({stl_size} bytes)")

if __name__ == "__main__":
    main()
