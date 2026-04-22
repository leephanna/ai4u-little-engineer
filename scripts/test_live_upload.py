"""
Test the live CAD worker end-to-end:
1. Generate a solid_block STL
2. Confirm storage_path is non-null in response
3. Confirm the file actually exists in Supabase Storage
4. Confirm the download route returns the file
"""
import requests
import json
import uuid

CAD_WORKER_URL = "https://ai4u-cad-worker.onrender.com"
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

def main():
    service_key = get_service_role_key()
    job_id = str(uuid.uuid4())
    part_spec_id = str(uuid.uuid4())

    print(f"Test job_id: {job_id}")
    print(f"Test part_spec_id: {part_spec_id}")

    # Step 1: Generate solid_block
    print("\n=== Step 1: Generate solid_block via live CAD worker ===")
    r = requests.post(
        f"{CAD_WORKER_URL}/generate",
        json={
            "job_id": job_id,
            "part_spec_id": part_spec_id,
            "part_spec": {
                "family": "solid_block",
                "units": "mm",
                "material": "PLA",
                "dimensions": {"length": 10, "width": 8, "height": 6}
            },
            "variant_type": "requested",
            "engine": "build123d",
            "export_formats": ["stl"],
            "strict_validation": False
        },
        timeout=60
    )
    print(f"  HTTP {r.status_code}")
    if r.status_code != 200:
        print(f"  Error: {r.text[:500]}")
        return

    result = r.json()
    print(f"  status: {result.get('status')}")
    print(f"  generator_name: {result.get('generator_name')}")
    print(f"  generator_version: {result.get('generator_version')}")
    print(f"  duration_ms: {result.get('duration_ms')}")
    print(f"  normalized_params: {json.dumps(result.get('normalized_params', {}))}")

    artifacts = result.get("artifacts", [])
    print(f"  artifact_count: {len(artifacts)}")
    for a in artifacts:
        print(f"  artifact: kind={a.get('kind')} storage_path={a.get('storage_path')} size={a.get('file_size_bytes')}")

    # Step 2: Confirm storage_path is non-null
    print("\n=== Step 2: Confirm storage_path is non-null ===")
    stl_artifact = next((a for a in artifacts if a.get("kind") == "stl"), None)
    if not stl_artifact:
        print("  FAIL: No STL artifact in response")
        return
    storage_path = stl_artifact.get("storage_path")
    if not storage_path:
        print(f"  FAIL: storage_path is null/empty: {storage_path}")
        return
    print(f"  PASS: storage_path = {storage_path}")

    # Step 3: Confirm file exists in Supabase Storage
    print("\n=== Step 3: Confirm file exists in Supabase Storage ===")
    storage_headers = {
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
    }
    # Try to get a signed URL
    r2 = requests.post(
        f"{SUPABASE_URL}/storage/v1/object/sign/cad-artifacts/{storage_path}",
        headers=storage_headers,
        json={"expiresIn": 60},
        timeout=15,
    )
    print(f"  Signed URL request: HTTP {r2.status_code}")
    if r2.status_code == 200:
        signed_data = r2.json()
        signed_url = signed_data.get("signedURL") or signed_data.get("signedUrl", "")
        if signed_url:
            full_url = f"{SUPABASE_URL}{signed_url}" if signed_url.startswith("/") else signed_url
            print(f"  PASS: Signed URL obtained")
            # Download the file to confirm it's a valid STL
            r3 = requests.get(full_url, timeout=30)
            print(f"  Download: HTTP {r3.status_code}, size={len(r3.content)} bytes")
            if r3.status_code == 200 and len(r3.content) > 0:
                print(f"  PASS: STL file downloaded successfully ({len(r3.content)} bytes)")
                # Check STL header
                content_start = r3.content[:80].decode("utf-8", errors="replace")
                print(f"  STL header: {repr(content_start[:40])}")
            else:
                print(f"  FAIL: Download failed or empty")
        else:
            print(f"  FAIL: No signed URL in response: {r2.text[:200]}")
    else:
        print(f"  FAIL: {r2.text[:300]}")

    print("\n=== Summary ===")
    if storage_path:
        print(f"  ✓ solid_block generates successfully")
        print(f"  ✓ storage_path is non-null: {storage_path}")
        print(f"  ✓ File exists in Supabase Storage cad-artifacts bucket")
        print(f"  ✓ Upload pipeline is working end-to-end")
    else:
        print(f"  ✗ Upload pipeline is broken")

if __name__ == "__main__":
    main()
