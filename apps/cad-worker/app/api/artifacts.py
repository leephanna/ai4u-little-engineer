"""
Artifacts Download API Endpoint
GET /artifacts/{job_id}/{cad_run_id}/{filename} — Serve a generated artifact file.

This endpoint allows the Trigger.dev pipeline to download generated artifact
files (STL, STEP) from the CAD worker so it can upload them directly to
Supabase Storage. This is the fallback path when the CAD worker's own
Supabase upload fails (e.g., missing env var in container).
"""
import os
import logging
from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

logger = logging.getLogger(__name__)
router = APIRouter()

# Must match the ARTIFACTS_DIR used in generate.py
ARTIFACTS_DIR = os.getenv("ARTIFACTS_DIR", "/tmp/cad-artifacts")


@router.get("/{job_id}/{cad_run_id}/{filename}")
async def download_artifact(job_id: str, cad_run_id: str, filename: str):
    """
    Download a generated artifact file by job_id / cad_run_id / filename.
    Returns the raw file bytes with the appropriate Content-Type header.
    """
    # Sanitize path components to prevent directory traversal
    for component in [job_id, cad_run_id, filename]:
        if ".." in component or "/" in component or "\\" in component:
            raise HTTPException(status_code=400, detail="Invalid path component")

    artifact_path = Path(ARTIFACTS_DIR) / job_id / cad_run_id / filename
    if not artifact_path.exists():
        logger.warning(f"Artifact not found: {artifact_path}")
        raise HTTPException(
            status_code=404,
            detail=f"Artifact not found: {job_id}/{cad_run_id}/{filename}",
        )

    # Determine content type from extension
    ext = artifact_path.suffix.lower()
    content_type_map = {
        ".stl": "model/stl",
        ".step": "application/step",
        ".stp": "application/step",
        ".json": "application/json",
        ".png": "image/png",
    }
    content_type = content_type_map.get(ext, "application/octet-stream")

    logger.info(f"Serving artifact: {artifact_path} ({artifact_path.stat().st_size} bytes)")
    return FileResponse(
        path=str(artifact_path),
        media_type=content_type,
        filename=filename,
    )


@router.get("/{job_id}/{cad_run_id}")
async def list_artifacts(job_id: str, cad_run_id: str):
    """
    List all artifact files for a given job_id / cad_run_id.
    Returns a list of filenames with their sizes.
    """
    for component in [job_id, cad_run_id]:
        if ".." in component or "/" in component or "\\" in component:
            raise HTTPException(status_code=400, detail="Invalid path component")

    artifact_dir = Path(ARTIFACTS_DIR) / job_id / cad_run_id
    if not artifact_dir.exists():
        return {"job_id": job_id, "cad_run_id": cad_run_id, "files": []}

    files = []
    for f in artifact_dir.iterdir():
        if f.is_file():
            files.append({"filename": f.name, "size_bytes": f.stat().st_size})

    return {"job_id": job_id, "cad_run_id": cad_run_id, "files": files}
