"""
Generate Custom API Endpoint
POST /generate-custom — Generate a custom 3D shape from a natural language description
using LLM-driven CadQuery code generation.

This endpoint handles shapes that don't fit any of the 11 parametric families.
It supports an iterative refinement loop via `previous_code` + `refinement_instruction`.

Request body:
  description:             str  — natural language description of the shape
  job_id:                  str  — job ID for artifact storage
  previous_code:           str? — CadQuery code from a previous attempt (for refinement)
  refinement_instruction:  str? — user's refinement request (e.g. "make it taller")

Response:
  status:                  "success" | "failed"
  storage_path:            str? — Supabase Storage path (non-None on success)
  generated_code:          str? — the CadQuery code that was executed
  plain_english_summary:   str? — one-sentence description of what was generated
  error:                   str? — error message on failure
  cad_run_id:              str  — unique run identifier
  attempts:                int  — number of LLM attempts made
  duration_ms:             float
"""

import os
import time
import uuid
import logging
from pathlib import Path
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.generators.llm_cad import generate_custom_shape
from app.storage.supabase_uploader import upload_artifact

logger = logging.getLogger(__name__)
router = APIRouter()

ARTIFACTS_DIR = os.getenv("ARTIFACTS_DIR", "/tmp/cad-artifacts")


# ─────────────────────────────────────────────────────────────────────────────
# Request / Response models
# ─────────────────────────────────────────────────────────────────────────────
class CustomGenerateRequest(BaseModel):
    description: str = Field(..., min_length=3, max_length=1000)
    job_id: str = Field(..., min_length=1, max_length=128)
    previous_code: Optional[str] = Field(None, max_length=8000)
    refinement_instruction: Optional[str] = Field(None, max_length=500)


class CustomGenerateResult(BaseModel):
    status: str
    storage_path: Optional[str] = None
    generated_code: Optional[str] = None
    plain_english_summary: Optional[str] = None
    error: Optional[str] = None
    cad_run_id: str
    attempts: int = 0
    duration_ms: float = 0.0


# ─────────────────────────────────────────────────────────────────────────────
# Endpoint
# ─────────────────────────────────────────────────────────────────────────────
@router.post("", response_model=CustomGenerateResult)
async def generate_custom(request: CustomGenerateRequest) -> CustomGenerateResult:
    """
    Generate a custom 3D shape from a natural language description.

    Uses LLM-driven CadQuery code generation with up to 3 retry attempts.
    Supports refinement via previous_code + refinement_instruction.
    """
    start_time = time.time()
    run_id = str(uuid.uuid4())

    logger.info(
        f"[generate-custom] job={request.job_id} run={run_id} "
        f"description={request.description[:60]!r} "
        f"refinement={bool(request.refinement_instruction)}"
    )

    # Determine output directory
    artifact_dir = Path(ARTIFACTS_DIR) / request.job_id / run_id
    artifact_dir.mkdir(parents=True, exist_ok=True)

    # Run the LLM-driven generator
    result = generate_custom_shape(
        description=request.description,
        output_dir=str(artifact_dir),
        job_id=request.job_id,
        run_id=run_id,
        previous_code=request.previous_code,
        refinement_instruction=request.refinement_instruction,
    )

    duration_ms = round((time.time() - start_time) * 1000, 1)

    if result["status"] != "success":
        logger.error(
            f"[generate-custom] FAILED job={request.job_id} run={run_id} "
            f"attempts={result['attempts']} error={result['error']}"
        )
        return CustomGenerateResult(
            status="failed",
            generated_code=result.get("generated_code"),
            error=result.get("error"),
            cad_run_id=run_id,
            attempts=result.get("attempts", 0),
            duration_ms=duration_ms,
        )

    # Upload STL to Supabase Storage
    stl_path = result["stl_path"]
    try:
        storage_path = upload_artifact(
            local_path=stl_path,
            job_id=request.job_id,
            cad_run_id=run_id,
            mime_type="model/stl",
        )
    except Exception as upload_exc:
        logger.error(
            f"[generate-custom] Upload failed job={request.job_id} run={run_id}: {upload_exc}",
            exc_info=True,
        )
        return CustomGenerateResult(
            status="failed",
            generated_code=result.get("generated_code"),
            plain_english_summary=result.get("plain_english_summary"),
            error=f"Artifact upload failed: {upload_exc}",
            cad_run_id=run_id,
            attempts=result.get("attempts", 0),
            duration_ms=duration_ms,
        )

    logger.info(
        f"[generate-custom] SUCCESS job={request.job_id} run={run_id} "
        f"storage_path={storage_path} attempts={result['attempts']} "
        f"duration_ms={duration_ms}"
    )

    return CustomGenerateResult(
        status="success",
        storage_path=storage_path,
        generated_code=result.get("generated_code"),
        plain_english_summary=result.get("plain_english_summary"),
        cad_run_id=run_id,
        attempts=result.get("attempts", 0),
        duration_ms=duration_ms,
    )
