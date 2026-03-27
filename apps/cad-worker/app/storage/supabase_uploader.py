"""
Supabase Storage uploader for the CAD worker.

Uploads generated artifact files to the 'cad-artifacts' Supabase Storage bucket
and returns the canonical storage path used by the Trigger.dev pipeline and
the artifacts table.

Storage layout:
  cad-artifacts/{job_id}/{cad_run_id}/{filename}

Environment variables required:
  SUPABASE_URL              — e.g. https://xyzxyz.supabase.co
  SUPABASE_SERVICE_ROLE_KEY — service role key (bypasses RLS for worker uploads)

Hardening contract (v0.2.0):
  - If SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY are not set, raises RuntimeError.
  - If any upload fails (non-2xx HTTP), raises RuntimeError.
  - storage_path is NEVER None for a successful run; callers must not accept None.

Implementation note:
  Uses httpx directly (not supabase-py) to avoid the supabase-py v2.5.0 bug:
  "Invalid non-printable ASCII character in URL" when the JWT contains certain
  characters that are mishandled by the underlying httpx URL builder in supabase-py.

Local dev / unit tests:
  Set SUPABASE_UPLOAD_SKIP=1 to bypass uploads and return a synthetic path.
  This env var must NOT be set in production.
"""

import os
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

BUCKET_NAME = "cad-artifacts"


def upload_artifact(
    local_path: str,
    job_id: str,
    cad_run_id: str,
    mime_type: str,
) -> str:
    """
    Upload a file to Supabase Storage using httpx directly.

    Returns the storage_path (relative to the bucket root) on success.
    Raises RuntimeError on any failure — callers must not catch silently.

    In local dev, set SUPABASE_UPLOAD_SKIP=1 to return a synthetic path.
    """
    # Local dev bypass — must never be set in production
    if os.getenv("SUPABASE_UPLOAD_SKIP") == "1":
        file_path = Path(local_path)
        synthetic = f"{job_id}/{cad_run_id}/{file_path.name}"
        logger.warning(
            f"SUPABASE_UPLOAD_SKIP=1 — skipping real upload, returning synthetic path: {synthetic}"
        )
        return synthetic

    supabase_url = os.getenv("SUPABASE_URL")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url or not service_key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set. "
            "Artifact upload cannot proceed without Supabase credentials."
        )

    file_path = Path(local_path)
    if not file_path.exists():
        raise RuntimeError(f"Artifact file not found for upload: {local_path}")

    storage_path = f"{job_id}/{cad_run_id}/{file_path.name}"

    with open(file_path, "rb") as f:
        file_bytes = f.read()

    # Build the upload URL manually — avoids supabase-py's URL construction bug
    # Use the Supabase Storage REST API directly via httpx
    upload_url = f"{supabase_url.rstrip('/')}/storage/v1/object/{BUCKET_NAME}/{storage_path}"

    try:
        import httpx
        headers = {
            "Authorization": f"Bearer {service_key}",
            "Content-Type": mime_type,
            "x-upsert": "true",
        }
        response = httpx.put(
            upload_url,
            content=file_bytes,
            headers=headers,
            timeout=30.0,
        )
    except Exception as exc:
        raise RuntimeError(
            f"Supabase Storage upload failed for {storage_path}: {exc}"
        ) from exc

    if response.status_code not in (200, 201):
        raise RuntimeError(
            f"Supabase Storage upload failed for {storage_path}: "
            f"HTTP {response.status_code} — {response.text[:300]}"
        )

    logger.info(
        f"Uploaded artifact to storage: {storage_path} ({len(file_bytes)} bytes) "
        f"[HTTP {response.status_code}]"
    )
    return storage_path


def upload_artifacts_batch(
    artifacts: list[dict],
    job_id: str,
    cad_run_id: str,
) -> list[dict]:
    """
    Upload a list of artifact dicts to Supabase Storage.

    Each dict must have: local_path, mime_type, kind, file_size_bytes.
    Returns the same list with a real (non-None) 'storage_path' on each item.

    Raises RuntimeError if any upload fails — the run must be marked failed.
    """
    results = []
    for artifact in artifacts:
        storage_path = upload_artifact(
            local_path=artifact["local_path"],
            job_id=job_id,
            cad_run_id=cad_run_id,
            mime_type=artifact["mime_type"],
        )
        # storage_path is guaranteed non-None here (upload_artifact raises on failure)
        results.append({
            **artifact,
            "storage_path": storage_path,
        })
    return results
