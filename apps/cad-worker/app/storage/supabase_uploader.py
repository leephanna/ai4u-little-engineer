"""
Supabase Storage uploader for the CAD worker.

Uploads generated artifact files to the 'cad-artifacts' Supabase Storage bucket
and returns the canonical storage path used by the Trigger.dev pipeline and
the artifacts table.

Storage layout:
  cad-artifacts/{job_id}/{cad_run_id}/{filename}

Environment variables required:
  SUPABASE_URL            — e.g. https://xyzxyz.supabase.co
  SUPABASE_SERVICE_ROLE_KEY — service role key (bypasses RLS for worker uploads)

If SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY are not set, upload is skipped and
the local_path is returned as-is (useful for local dev / unit tests).
"""

import os
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# Lazy-initialised Supabase client
_supabase_client = None

BUCKET_NAME = "cad-artifacts"


def _get_client():
    """Return a cached Supabase client, or None if env vars are missing."""
    global _supabase_client
    if _supabase_client is not None:
        return _supabase_client

    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

    if not url or not key:
        logger.warning(
            "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — "
            "artifact upload will be skipped."
        )
        return None

    try:
        from supabase import create_client  # type: ignore
        _supabase_client = create_client(url, key)
        logger.info("Supabase client initialised for artifact upload")
    except ImportError:
        logger.error("supabase package not installed — cannot upload artifacts")
        return None

    return _supabase_client


def upload_artifact(
    local_path: str,
    job_id: str,
    cad_run_id: str,
    mime_type: str,
) -> Optional[str]:
    """
    Upload a file to Supabase Storage.

    Returns the storage_path (relative to the bucket root) on success,
    or None if the upload fails or Supabase is not configured.

    The caller should fall back to the local_path if None is returned.
    """
    client = _get_client()
    if client is None:
        # Supabase not configured — return None to signal skip
        return None

    file_path = Path(local_path)
    if not file_path.exists():
        logger.error(f"Artifact file not found for upload: {local_path}")
        return None

    storage_path = f"{job_id}/{cad_run_id}/{file_path.name}"

    try:
        with open(file_path, "rb") as f:
            file_bytes = f.read()

        # upsert=True so re-runs overwrite cleanly
        response = client.storage.from_(BUCKET_NAME).upload(
            path=storage_path,
            file=file_bytes,
            file_options={
                "content-type": mime_type,
                "upsert": "true",
            },
        )

        # supabase-py v2 raises on error; v1 returns a dict with 'error'
        if hasattr(response, "error") and response.error:
            logger.error(
                f"Supabase Storage upload error for {storage_path}: {response.error}"
            )
            return None

        logger.info(f"Uploaded artifact to storage: {storage_path} ({len(file_bytes)} bytes)")
        return storage_path

    except Exception as exc:
        logger.error(
            f"Exception uploading {local_path} to {storage_path}: {exc}",
            exc_info=True,
        )
        return None


def upload_artifacts_batch(
    artifacts: list[dict],
    job_id: str,
    cad_run_id: str,
) -> list[dict]:
    """
    Upload a list of artifact dicts to Supabase Storage.

    Each dict must have: local_path, mime_type, kind, file_size_bytes.
    Returns the same list with an added 'storage_path' key on each item.
    If upload fails, storage_path is set to None (Trigger.dev pipeline handles fallback).
    """
    results = []
    for artifact in artifacts:
        storage_path = upload_artifact(
            local_path=artifact["local_path"],
            job_id=job_id,
            cad_run_id=cad_run_id,
            mime_type=artifact["mime_type"],
        )
        results.append({
            **artifact,
            "storage_path": storage_path,
        })
    return results
