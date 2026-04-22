"""
Check Render CAD worker service env vars for SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
Also check the Trigger.dev env vars for the same.
"""
import os
import json
import requests

RENDER_API_KEY = "rnd_6bw8dnTsbbua5IpBNJROIaWXu39M"
VERCEL_TOKEN = os.environ.get("VERCEL_TOKEN", "")

def get_render_services():
    r = requests.get(
        "https://api.render.com/v1/services",
        headers={"Authorization": f"Bearer {RENDER_API_KEY}", "Accept": "application/json"},
        timeout=15,
    )
    r.raise_for_status()
    return r.json()

def get_render_env_vars(service_id):
    r = requests.get(
        f"https://api.render.com/v1/services/{service_id}/env-vars",
        headers={"Authorization": f"Bearer {RENDER_API_KEY}", "Accept": "application/json"},
        timeout=15,
    )
    r.raise_for_status()
    return r.json()

def main():
    print("=== Render Services ===")
    services = get_render_services()
    cad_service = None
    for svc_wrapper in services:
        svc = svc_wrapper.get("service", svc_wrapper)
        name = svc.get("name", "")
        svc_id = svc.get("id", "")
        print(f"  {name} ({svc_id})")
        if "cad" in name.lower() or "worker" in name.lower():
            cad_service = svc

    if not cad_service:
        print("ERROR: Could not find CAD worker service")
        return

    svc_id = cad_service["id"]
    svc_name = cad_service["name"]
    print(f"\n=== Env vars for '{svc_name}' ({svc_id}) ===")
    env_vars = get_render_env_vars(svc_id)

    # Check for required vars
    env_dict = {}
    for ev in env_vars:
        key = ev.get("envVar", ev).get("key", "") if isinstance(ev.get("envVar"), dict) else ev.get("key", "")
        val = ev.get("envVar", ev).get("value", "") if isinstance(ev.get("envVar"), dict) else ev.get("value", "")
        env_dict[key] = val

    print(f"  Total env vars: {len(env_dict)}")
    print(f"  All keys: {sorted(env_dict.keys())}")

    # Check critical vars
    critical = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_UPLOAD_SKIP", "ARTIFACTS_DIR"]
    print("\n=== Critical env var check ===")
    for k in critical:
        if k in env_dict:
            v = env_dict[k]
            # Mask sensitive values
            if "KEY" in k or "SECRET" in k:
                display = v[:8] + "..." if v else "(empty)"
            else:
                display = v or "(empty)"
            print(f"  {k}: SET → {display}")
        else:
            print(f"  {k}: MISSING ← THIS IS THE PROBLEM")

if __name__ == "__main__":
    main()
