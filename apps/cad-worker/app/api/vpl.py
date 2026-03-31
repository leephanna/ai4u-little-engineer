"""
VPL API Endpoint
POST /vpl — Run the Virtual Print Lab on an STL file path or URL.
"""
import os
import logging
import tempfile
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import httpx

logger = logging.getLogger(__name__)
router = APIRouter()


class VPLRequest(BaseModel):
    stl_path: Optional[str] = None       # local path (for internal calls)
    stl_url: Optional[str] = None        # public URL (for Trigger.dev calls)
    slicer_settings: Optional[dict] = None


class VPLResponse(BaseModel):
    success: bool
    result: Optional[dict] = None
    error: Optional[str] = None


@router.post("/vpl", response_model=VPLResponse)
async def run_virtual_print_lab(req: VPLRequest) -> VPLResponse:
    """
    Run the full VPL pipeline (geometry validation + slicer simulation +
    heuristic analysis + score calculation) on an STL file.

    Accepts either a local file path or a public URL.
    """
    from app.vpl import run_vpl

    stl_path = req.stl_path
    tmp_file = None

    try:
        # If URL provided, download the STL to a temp file
        if req.stl_url and not stl_path:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(req.stl_url)
                if resp.status_code != 200:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Failed to download STL from URL: HTTP {resp.status_code}"
                    )
            tmp_file = tempfile.NamedTemporaryFile(suffix=".stl", delete=False)
            tmp_file.write(resp.content)
            tmp_file.close()
            stl_path = tmp_file.name

        if not stl_path:
            raise HTTPException(status_code=400, detail="Either stl_path or stl_url must be provided")

        if not os.path.exists(stl_path):
            raise HTTPException(status_code=404, detail=f"STL file not found: {stl_path}")

        logger.info(f"VPL: starting analysis on {stl_path}")
        result = run_vpl(stl_path, slicer_settings=req.slicer_settings)
        logger.info(
            f"VPL: score={result['print_success_score']} grade={result['grade']} "
            f"elapsed={result['elapsed_seconds']}s"
        )

        return VPLResponse(success=True, result=result)

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"VPL: unexpected error: {e}")
        return VPLResponse(success=False, error=str(e))
    finally:
        if tmp_file and os.path.exists(tmp_file.name):
            try:
                os.unlink(tmp_file.name)
            except OSError:
                pass
