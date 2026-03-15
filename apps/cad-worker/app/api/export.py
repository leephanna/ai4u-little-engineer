"""
Export API Endpoint
POST /export — Re-export an existing CAD artifact in a different format.
"""

import logging
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Literal, Optional

logger = logging.getLogger(__name__)
router = APIRouter()


class ExportRequest(BaseModel):
    local_step_path: str
    format: Literal["stl", "step"] = "stl"
    output_path: str
    tolerance: float = 0.001
    angular_tolerance: float = 0.1


class ExportResponse(BaseModel):
    status: str
    output_path: str
    file_size_bytes: Optional[int] = None
    format: str


@router.post("", response_model=ExportResponse)
async def export_cad(request: ExportRequest) -> ExportResponse:
    """Re-export a CAD file in the requested format."""
    import os

    if not os.path.exists(request.local_step_path):
        raise HTTPException(status_code=404, detail=f"Source file not found: {request.local_step_path}")

    try:
        if request.format == "stl":
            from build123d import import_step
            from app.exporters.stl_export import export_stl
            part = import_step(request.local_step_path)
            export_stl(
                part,
                request.output_path,
                tolerance=request.tolerance,
                angular_tolerance=request.angular_tolerance,
            )
        elif request.format == "step":
            import shutil
            shutil.copy2(request.local_step_path, request.output_path)

        file_size = os.path.getsize(request.output_path) if os.path.exists(request.output_path) else None

        return ExportResponse(
            status="success",
            output_path=request.output_path,
            file_size_bytes=file_size,
            format=request.format,
        )

    except ImportError:
        raise HTTPException(status_code=503, detail="build123d not available")
    except Exception as e:
        logger.error(f"Export failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Export failed: {e}")
