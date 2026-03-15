"""
Validate API Endpoint
POST /validate — Run geometry validation on an existing CAD run.
"""

import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List

logger = logging.getLogger(__name__)
router = APIRouter()


class ValidateRequest(BaseModel):
    cad_run_id: str
    job_id: str
    local_step_path: Optional[str] = None
    max_dimensions_mm: Optional[List[float]] = None
    nozzle_size_mm: float = 0.4


class ValidateResponse(BaseModel):
    cad_run_id: str
    bounding_box_ok: bool
    wall_thickness_ok: bool
    units_ok: bool
    printability_score: float
    bounding_box_mm: Optional[List[float]] = None
    warnings: List[str]
    errors: List[str]


@router.post("", response_model=ValidateResponse)
async def validate_geometry(request: ValidateRequest) -> ValidateResponse:
    """
    Run geometry validation on an existing CAD artifact.
    If local_step_path is provided, loads and validates the STEP file.
    """
    warnings = []
    errors = []
    bbox = None
    bbox_ok = True
    wall_ok = True
    printability_score = 0.0

    if request.local_step_path:
        try:
            from build123d import import_step
            part = import_step(request.local_step_path)

            from app.validators.dimensions import validate_bounding_box, validate_volume
            from app.validators.printable import score_printability

            bbox_ok, bbox, bbox_warnings = validate_bounding_box(
                part, max_dimensions_mm=request.max_dimensions_mm
            )
            warnings.extend(bbox_warnings)

            vol_ok, _, vol_warnings = validate_volume(part)
            if not vol_ok:
                errors.extend(vol_warnings)

            printability_score, print_warnings, print_errors = score_printability(
                part,
                bounding_box=bbox,
                nozzle_size_mm=request.nozzle_size_mm,
            )
            warnings.extend(print_warnings)
            errors.extend(print_errors)

        except ImportError:
            warnings.append("build123d not available — geometry validation skipped")
            printability_score = 0.5
        except Exception as e:
            errors.append(f"Validation error: {e}")
            logger.error(f"Validation failed: {e}", exc_info=True)
    else:
        warnings.append("No STEP file path provided — skipping geometry validation")
        printability_score = 0.5

    return ValidateResponse(
        cad_run_id=request.cad_run_id,
        bounding_box_ok=bbox_ok,
        wall_thickness_ok=wall_ok,
        units_ok=True,
        printability_score=printability_score,
        bounding_box_mm=bbox,
        warnings=warnings,
        errors=errors,
    )
