"""
Check Supabase Storage buckets and test the upload path.
Uses the service role key from Render env vars.
"""
import requests
import json

SUPABASE_URL = "https://lphtdosxneplxgkygjom.supabase.co"
# Get service role key from Render
RENDER_API_KEY = "rnd_6bw8dnTsbbua5IpBNJROIaWXu39M"

def get_service_role_key():
    r = requests.get(
        "https://api.render.com/v1/services/srv-d71u4m8ule4c73d3u16g/env-vars",
        headers={"Authorization": f"Bearer {RENDER_API_KEY}", "Accept": "application/json"},
        timeout=15,
    )
    r.raise_for_status()
    env_vars = r.json()
    for ev in env_vars:
        item = ev.get("envVar", ev)
        if item.get("key") == "SUPABASE_SERVICE_ROLE_KEY":
            return item.get("value", "")
    return None

def main():
    print("Getting service role key from Render...")
    service_key = get_service_role_key()
    if not service_key:
        print("ERROR: Could not get SUPABASE_SERVICE_ROLE_KEY")
        return
    print(f"Service key: {service_key[:20]}...")

    headers = {
        "Authorization": f"Bearer {service_key}",
        "apikey": service_key,
        "Content-Type": "application/json",
    }

    # List all storage buckets
    print("\n=== Supabase Storage Buckets ===")
    r = requests.get(
        f"{SUPABASE_URL}/storage/v1/bucket",
        headers=headers,
        timeout=15,
    )
    print(f"  HTTP {r.status_code}")
    if r.status_code == 200:
        buckets = r.json()
        for b in buckets:
            print(f"  Bucket: {b.get('name')} (id={b.get('id')}, public={b.get('public')})")
    else:
        print(f"  Error: {r.text[:300]}")

    # Test upload to cad-artifacts bucket with a tiny test file
    print("\n=== Test Upload to cad-artifacts ===")
    test_path = "test-probe/test-run/test.txt"
    upload_url = f"{SUPABASE_URL}/storage/v1/object/cad-artifacts/{test_path}"
    upload_headers = {
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "text/plain",
        "x-upsert": "true",
    }
    r = requests.put(
        upload_url,
        data=b"test upload probe",
        headers=upload_headers,
        timeout=15,
    )
    print(f"  Upload HTTP {r.status_code}: {r.text[:300]}")

    # Also test the 'artifacts' bucket name (in case spec uses different name)
    print("\n=== Test Upload to artifacts ===")
    upload_url2 = f"{SUPABASE_URL}/storage/v1/object/artifacts/{test_path}"
    r2 = requests.put(
        upload_url2,
        data=b"test upload probe",
        headers=upload_headers,
        timeout=15,
    )
    print(f"  Upload HTTP {r2.status_code}: {r2.text[:300]}")

    # Check the DB artifacts table for recent rows
    print("\n=== Recent artifacts table rows ===")
    db_headers = {
        "Authorization": f"Bearer {service_key}",
        "apikey": service_key,
        "Content-Type": "application/json",
    }
    r3 = requests.get(
        f"{SUPABASE_URL}/rest/v1/artifacts?select=id,job_id,kind,storage_path,created_at&order=created_at.desc&limit=5",
        headers=db_headers,
        timeout=15,
    )
    print(f"  HTTP {r3.status_code}")
    if r3.status_code == 200:
        rows = r3.json()
        for row in rows:
            print(f"  {row.get('id','?')[:8]} kind={row.get('kind')} storage_path={row.get('storage_path')} created={row.get('created_at','?')[:19]}")
    else:
        print(f"  Error: {r3.text[:300]}")

    # Check recent cad_runs for upload_failed errors
    print("\n=== Recent cad_runs with upload_failed ===")
    r4 = requests.get(
        f"{SUPABASE_URL}/rest/v1/cad_runs?select=id,job_id,status,error_text,ended_at&status=eq.failed&order=ended_at.desc&limit=5",
        headers=db_headers,
        timeout=15,
    )
    print(f"  HTTP {r4.status_code}")
    if r4.status_code == 200:
        rows = r4.json()
        for row in rows:
            err = (row.get('error_text') or '')[:80]
            print(f"  {row.get('id','?')[:8]} status={row.get('status')} error={err}")
    else:
        print(f"  Error: {r4.text[:300]}")

if __name__ == "__main__":
    main()
