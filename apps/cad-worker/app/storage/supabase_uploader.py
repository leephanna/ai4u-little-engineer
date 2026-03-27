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
  - If the supabase package is not installed, raises ImportError.
  - If any upload fails, raises RuntimeError.
  - storage_path is NEVER None for a successful run; callers must not accept None.

Local dev / unit tests:
  Set SUPABASE_UPLOAD_SKIP=1 to bypass uploads and return a synthetic path.
  This env var must NOT be set in production.
"""

import os
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# Lazy-initialised Supabase client
_supabase_client = None

BUCKET_NAME = "cad-artifacts"


def _get_client():
    """
    Return a cached Supabase client.

    Raises RuntimeError if env vars are missing (production invariant).
    Raises ImportError if the supabase package is not installed.
    """
    global _supabase_client
    if _supabase_client is not None:
        return _supabase_client

    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set. "
            "Artifact upload cannot proceed without Supabase credentials."
        )

    try:
        from supabase import create_client  # type: ignore
    except ImportError as e:
        raise ImportError(
            "supabase package is not installed. "
            "Add 'supabase==2.5.0' to requirements.txt and rebuild the image."
        ) from e

    _supabase_client = create_client(url, key)
    logger.info("Supabase client initialised for artifact upload")
    return _supabase_client


def upload_artifact(
    local_path: str,
    job_id: str,
    cad_run_id: str,
    mime_type: str,
) -> str:
    """
    Upload a file to Supabase Storage.

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

    client = _get_client()

    file_path = Path(local_path)
    if not file_path.exists():
        raise RuntimeError(f"Artifact file not found for upload: {local_path}")

    storage_path = f"{job_id}/{cad_run_id}/{file_path.name}"

    with open(file_path, "rb") as f:
        file_bytes = f.read()

    try:
        # upsert=True so re-runs overwrite cleanly
        response = client.storage.from_(BUCKET_NAME).upload(
            path=storage_path,
            file=file_bytes,
            file_options={
                "content-type": mime_type,
                "upsert": "true",
            },
        )
    except Exception as exc:
        raise RuntimeError(
            f"Supabase Storage upload failed for {storage_path}: {exc}"
        ) from exc

    # supabase-py v2 raises on error; v1 returns a dict with 'error'
    if hasattr(response, "error") and response.error:
        raise RuntimeError(
            f"Supabase Storage upload error for {storage_path}: {response.error}"
        )

    logger.info(
        f"Uploaded artifact to storage: {storage_path} ({len(file_bytes)} bytes)"
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
