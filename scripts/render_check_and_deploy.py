"""
Check Render deploy history for the CAD worker and trigger a new deploy if needed.
Then test the live CAD worker to confirm upload works end-to-end.
"""
import requests
import json
import time

RENDER_API_KEY = "rnd_6bw8dnTsbbua5IpBNJROIaWXu39M"
SERVICE_ID = "srv-d71u4m8ule4c73d3u16g"
CAD_WORKER_URL = "https://ai4u-cad-worker.onrender.com"

headers = {"Authorization": f"Bearer {RENDER_API_KEY}", "Accept": "application/json"}

def get_deploys():
    r = requests.get(
        f"https://api.render.com/v1/services/{SERVICE_ID}/deploys?limit=5",
        headers=headers, timeout=15
    )
    r.raise_for_status()
    return r.json()

def trigger_deploy():
    r = requests.post(
        f"https://api.render.com/v1/services/{SERVICE_ID}/deploys",
        headers={**headers, "Content-Type": "application/json"},
        json={"clearCache": "do_not_clear"},
        timeout=15
    )
    r.raise_for_status()
    return r.json()

def get_deploy_status(deploy_id):
    r = requests.get(
        f"https://api.render.com/v1/services/{SERVICE_ID}/deploys/{deploy_id}",
        headers=headers, timeout=15
    )
    r.raise_for_status()
    return r.json()

def check_cad_worker_health():
    try:
        r = requests.get(f"{CAD_WORKER_URL}/health", timeout=10)
        return r.status_code, r.json() if r.status_code == 200 else r.text[:200]
    except Exception as e:
        return None, str(e)

def check_solid_block_supported():
    """Test if solid_block is accepted (returns 422 for missing dims, not 400 for unsupported family)"""
    try:
        r = requests.post(
            f"{CAD_WORKER_URL}/generate",
            json={
                "job_id": "00000000-0000-0000-0000-000000000001",
                "part_spec_id": "00000000-0000-0000-0000-000000000002",
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
            timeout=30
        )
        return r.status_code, r.json() if r.status_code in (200, 400, 422) else r.text[:200]
    except Exception as e:
        return None, str(e)

def main():
    print("=== Recent Render Deploys ===")
    deploys = get_deploys()
    latest_commit = None
    for d in deploys:
        dep = d.get("deploy", d)
        dep_id = dep.get("id", "?")
        status = dep.get("status", "?")
        commit = dep.get("commit", {})
        commit_id = commit.get("id", "?")[:8] if commit else "?"
        commit_msg = (commit.get("message", "?") or "?")[:50] if commit else "?"
        created = dep.get("createdAt", "?")[:19]
        print(f"  {dep_id[:12]} status={status} commit={commit_id} msg='{commit_msg}' created={created}")
        if status == "live" and latest_commit is None:
            latest_commit = commit_id

    print(f"\nLatest live commit: {latest_commit}")
    print(f"Expected commit: 51591ac (or later)")

    # Check health
    print("\n=== CAD Worker Health ===")
    status, data = check_cad_worker_health()
    print(f"  HTTP {status}: {data}")

    # Check solid_block support
    print("\n=== solid_block Support Check ===")
    status, data = check_solid_block_supported()
    print(f"  HTTP {status}: {json.dumps(data, indent=2)[:500] if isinstance(data, dict) else data}")

    # Determine if we need a new deploy
    needs_deploy = latest_commit not in ["51591ac", "3e1133d", "8f7b2ec", "151ad25", "115a1ec", "b6dab49", "90a920f"]
    if needs_deploy:
        print(f"\n⚠ Live commit {latest_commit} is older than expected. Triggering new deploy...")
        result = trigger_deploy()
        dep = result.get("deploy", result)
        new_deploy_id = dep.get("id", "?")
        print(f"  New deploy triggered: {new_deploy_id}")

        # Poll for completion
        print("  Polling for deploy completion (max 15 min)...")
        for i in range(30):
            time.sleep(30)
            dep_status = get_deploy_status(new_deploy_id)
            dep = dep_status.get("deploy", dep_status)
            status = dep.get("status", "?")
            print(f"  [{i+1}/30] status={status}")
            if status == "live":
                print("  ✓ Deploy is live!")
                break
            elif status in ("failed", "canceled"):
                print(f"  ✗ Deploy {status}")
                break
    else:
        print(f"\n✓ Live commit {latest_commit} is current — no new deploy needed")

if __name__ == "__main__":
    main()
