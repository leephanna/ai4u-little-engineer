"""
Generate API Endpoint
POST /generate — Generate a CAD model from a PartSpec.

Fix C: After exporting STEP/STL files, this endpoint now uploads them to
Supabase Storage via app.storage.supabase_uploader and includes the real
storage_path in every ArtifactResult. The Trigger.dev pipeline can then
record the canonical path directly without a TODO stub.
"""

import os
import time
import uuid
import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException

from app.schemas.generation_request import (
    GenerationRequest,
    GenerationResult,
    ArtifactResult,
    ValidationReport,
)
from app.schemas.part_spec import PartSpec
from app.generators import get_generator, is_supported, list_partial_families
from app.utils.print_time import estimate_print_time_minutes
from app.validators.dimensions import validate_bounding_box, validate_volume
from app.validators.printable import score_printability, check_wall_thickness
from app.exporters.step_export import export_step
from app.exporters.stl_export import export_stl
from app.storage.supabase_uploader import upload_artifacts_batch

logger = logging.getLogger(__name__)
router = APIRouter()

# In Docker: /app/artifacts (set via ARTIFACTS_DIR env var in Dockerfile)
# In local dev: /tmp/cad-artifacts (writable without root)
ARTIFACTS_DIR = os.getenv("ARTIFACTS_DIR", "/tmp/cad-artifacts")


@router.post("", response_model=GenerationResult)
async def generate_cad(request: GenerationRequest) -> GenerationResult:
    """
    Generate a CAD model from a PartSpec.

    Returns status='success' only when CAD generation AND file export succeed.
    Artifacts include real Supabase Storage paths when SUPABASE_URL and
    SUPABASE_SERVICE_ROLE_KEY are configured.
    """
    start_time = time.time()
    run_id = str(uuid.uuid4())

    logger.info(
        f"Generation request: job={request.job_id} family={request.part_spec.family} "
        f"variant={request.variant_type} engine={request.engine}"
    )

    # Normalize units to mm
    spec = request.part_spec.normalize_to_mm()
    dims = spec.dimensions

    # Check engine
    if request.engine == "freecad":
        from app.adapters.freecad_adapter import FREECAD_ENABLED
        if not FREECAD_ENABLED:
            raise HTTPException(
                status_code=400,
                detail="FreeCAD engine is disabled. Use engine='build123d'.",
            )

    # Check if family is supported
    if not is_supported(spec.family):
        partial = list_partial_families()
        if spec.family in partial:
            raise HTTPException(
                status_code=400,
                detail=f"Part family '{spec.family}' is PARTIAL: {partial[spec.family]}",
            )
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unsupported part family: '{spec.family}'. "
                f"Supported: spacer, l_bracket, u_bracket, hole_plate, cable_clip, enclosure"
            ),
        )

    generator = get_generator(spec.family)
    generator_name = generator["name"]
    generator_version = generator["version"]

    # Validate dimensions before attempting generation or normalization
    # This ensures missing required dimensions are caught with a clear error
    # before get_normalized_params() is called (which may silently accept None).
    if hasattr(generator.get("validate_params"), "__call__"):
        dim_errors = generator["validate_params"](dims)
        if dim_errors:
            return GenerationResult(
                status="failed",
                job_id=request.job_id,
                part_spec_id=request.part_spec_id,
                cad_run_id=run_id,
                engine=request.engine,
                generator_name=generator_name,
                generator_version=generator_version,
                normalized_params={},
                error=f"Invalid dimensions: {'; '.join(dim_errors)}",
                failure_stage="invalid_dimensions",
                duration_ms=round((time.time() - start_time) * 1000, 1),
            )

    # Get normalized params (for receipt)
    try:
        normalized_params = generator["get_normalized_params"](dims, request.variant_type)
    except Exception as e:
        return GenerationResult(
            status="failed",
            job_id=request.job_id,
            part_spec_id=request.part_spec_id,
            cad_run_id=run_id,
            engine=request.engine,
            generator_name=generator_name,
            generator_version=generator_version,
            normalized_params={},
            error=str(e),
            failure_stage="spec_ambiguity",
            duration_ms=round((time.time() - start_time) * 1000, 1),
        )

    # Generate the CAD model
    part = None
    try:
        part = generator["generate"](dims, request.variant_type)
    except ValueError as e:
        return GenerationResult(
            status="failed",
            job_id=request.job_id,
            part_spec_id=request.part_spec_id,
            cad_run_id=run_id,
            engine=request.engine,
            generator_name=generator_name,
            generator_version=generator_version,
            normalized_params=normalized_params,
            error=str(e),
            failure_stage="invalid_dimensions",
            duration_ms=round((time.time() - start_time) * 1000, 1),
        )
    except ImportError as e:
        raise HTTPException(status_code=503, detail=f"CAD engine unavailable: {e}")
    except Exception as e:
        logger.error(f"Generator exception for {spec.family}: {e}", exc_info=True)
        return GenerationResult(
            status="failed",
            job_id=request.job_id,
            part_spec_id=request.part_spec_id,
            cad_run_id=run_id,
            engine=request.engine,
            generator_name=generator_name,
            generator_version=generator_version,
            normalized_params=normalized_params,
            error=str(e),
            failure_stage="generator_exception",
            duration_ms=round((time.time() - start_time) * 1000, 1),
        )

    # Validate geometry
    validation_warnings: list[str] = []
    validation_errors: list[str] = []

    bbox_ok, bbox, bbox_warnings = validate_bounding_box(
        part, max_dimensions_mm=spec.constraints.must_fit_within
    )
    validation_warnings.extend(bbox_warnings)

    vol_ok, volume, vol_warnings = validate_volume(part)
    if not vol_ok:
        validation_errors.extend(vol_warnings)

    wall_ok, wall_mm, wall_warnings = check_wall_thickness(dims, spec.family)
    validation_warnings.extend(wall_warnings)

    printability_score, print_warnings, print_errors = score_printability(
        part, wall_thickness_mm=wall_mm, bounding_box=bbox
    )
    validation_warnings.extend(print_warnings)
    validation_errors.extend(print_errors)

    validation = ValidationReport(
        bounding_box_ok=bbox_ok,
        wall_thickness_ok=wall_ok,
        units_ok=True,
        printability_score=printability_score,
        bounding_box_mm=bbox,
        min_wall_thickness_mm=wall_mm,
        warnings=validation_warnings,
        errors=validation_errors,
    )

    if request.strict_validation and validation_errors:
        return GenerationResult(
            status="failed",
            job_id=request.job_id,
            part_spec_id=request.part_spec_id,
            cad_run_id=run_id,
            engine=request.engine,
            generator_name=generator_name,
            generator_version=generator_version,
            normalized_params=normalized_params,
            validation=validation,
            error=f"Validation failed: {'; '.join(validation_errors)}",
            failure_stage="validation_failed",
            duration_ms=round((time.time() - start_time) * 1000, 1),
        )

    # ── Export files ─────────────────────────────────────────────
    local_artifacts: list[dict] = []
    artifact_dir = Path(ARTIFACTS_DIR) / request.job_id / run_id
    artifact_dir.mkdir(parents=True, exist_ok=True)

    export_errors: list[str] = []

    if "step" in request.export_formats:
        step_path = artifact_dir / f"{spec.family}_{request.variant_type}.step"
        try:
            export_step(part, str(step_path))
            local_artifacts.append({
                "kind": "step",
                "local_path": str(step_path),
                "mime_type": "application/step",
                "file_size_bytes": step_path.stat().st_size,
            })
        except Exception as e:
            export_errors.append(f"STEP export failed: {e}")
            logger.error(f"STEP export error: {e}", exc_info=True)

    if "stl" in request.export_formats:
        stl_path = artifact_dir / f"{spec.family}_{request.variant_type}.stl"
        try:
            export_stl(part, str(stl_path))
            local_artifacts.append({
                "kind": "stl",
                "local_path": str(stl_path),
                "mime_type": "model/stl",
                "file_size_bytes": stl_path.stat().st_size,
            })
        except Exception as e:
            export_errors.append(f"STL export failed: {e}")
            logger.error(f"STL export error: {e}", exc_info=True)

    if export_errors and not local_artifacts:
        return GenerationResult(
            status="failed",
            job_id=request.job_id,
            part_spec_id=request.part_spec_id,
            cad_run_id=run_id,
            engine=request.engine,
            generator_name=generator_name,
            generator_version=generator_version,
            normalized_params=normalized_params,
            validation=validation,
            error="; ".join(export_errors),
            failure_stage="export_exception",
            duration_ms=round((time.time() - start_time) * 1000, 1),
        )

    # ── Upload artifacts to Supabase Storage ─────────────────────
    # Fix C: upload happens here in the worker so the Trigger.dev pipeline
    # receives real storage_path values — no TODO stub needed.
    uploaded = upload_artifacts_batch(
        artifacts=local_artifacts,
        job_id=request.job_id,
        cad_run_id=run_id,
    )

    # Build ArtifactResult list — include storage_path in the response
    artifacts: list[ArtifactResult] = []
    for item in uploaded:
        artifacts.append(ArtifactResult(
            kind=item["kind"],
            local_path=item["local_path"],
            storage_path=item.get("storage_path"),   # None if Supabase not configured
            mime_type=item["mime_type"],
            file_size_bytes=item.get("file_size_bytes"),
        ))

    duration_ms = round((time.time() - start_time) * 1000, 1)

    # ── Print time estimation ────────────────────────────────────
    print_time_estimate: float | None = None
    if validation and validation.bounding_box_mm and len(validation.bounding_box_mm) >= 3:
        try:
            layer_height = 0.2
            infill_pct = 20
            print_speed = 60.0
            nozzle_dia = 0.4
            if request.printer_profile:
                layer_height = request.printer_profile.layer_height_mm or layer_height
                infill_pct = request.printer_profile.default_infill_percent or infill_pct
                print_speed = request.printer_profile.print_speed_mm_s or print_speed
                nozzle_dia = request.printer_profile.nozzle_diameter_mm or nozzle_dia
            print_time_estimate = estimate_print_time_minutes(
                bounding_box_mm=validation.bounding_box_mm,
                infill_percent=infill_pct,
                layer_height_mm=layer_height,
                print_speed_mm_s=print_speed,
                nozzle_diameter_mm=nozzle_dia,
            )
        except Exception as e:
            logger.warning(f"Print time estimation failed: {e}")

    logger.info(
        f"Generation SUCCESS: job={request.job_id} run={run_id} "
        f"family={spec.family} artifacts={len(artifacts)} "
        f"print_time={print_time_estimate}min duration={duration_ms}ms"
    )

    return GenerationResult(
        status="success",
        job_id=request.job_id,
        part_spec_id=request.part_spec_id,
        cad_run_id=run_id,
        engine=request.engine,
        generator_name=generator_name,
        generator_version=generator_version,
        normalized_params=normalized_params,
        artifacts=artifacts,
        validation=validation,
        assumptions=spec.assumptions,
        warnings=validation_warnings + export_errors,
        duration_ms=duration_ms,
        print_time_estimate_minutes=print_time_estimate,
    )
