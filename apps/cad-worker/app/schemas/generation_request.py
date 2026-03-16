"""
Pydantic schemas for generation requests and results.

Fix C: ArtifactResult now includes an optional storage_path field.
The CAD worker populates this after uploading to Supabase Storage.
The Trigger.dev pipeline reads storage_path directly — no TODO stub.
"""

from typing import Dict, List, Literal, Optional, Any
from pydantic import BaseModel, Field
from app.schemas.part_spec import PartSpec


class GenerationRequest(BaseModel):
    """Request to generate a CAD model."""
    job_id: str = Field(..., description="Job UUID from the web app")
    part_spec_id: str = Field(..., description="PartSpec UUID")
    part_spec: PartSpec = Field(..., description="The full part specification")
    variant_type: Literal["requested", "stronger", "print_optimized", "alternate"] = "requested"
    engine: Literal["build123d", "freecad"] = "build123d"
    preview: bool = True
    export_formats: List[Literal["step", "stl"]] = Field(default=["step", "stl"])
    strict_validation: bool = True


class ValidationReport(BaseModel):
    """Geometry validation results."""
    bounding_box_ok: bool = True
    wall_thickness_ok: bool = True
    units_ok: bool = True
    printability_score: float = Field(default=0.0, ge=0.0, le=1.0)
    bounding_box_mm: Optional[List[float]] = None  # [x, y, z]
    min_wall_thickness_mm: Optional[float] = None
    warnings: List[str] = Field(default_factory=list)
    errors: List[str] = Field(default_factory=list)


class ArtifactResult(BaseModel):
    """
    A generated artifact file.

    storage_path is the canonical path in the Supabase Storage bucket
    'cad-artifacts'. It is set by the CAD worker after upload and used
    by the Trigger.dev pipeline to record the artifact in the DB.
    If Supabase is not configured (local dev), storage_path is None.
    """
    kind: Literal["step", "stl", "png", "json_receipt", "log"]
    local_path: str
    storage_path: Optional[str] = None   # Real path in cad-artifacts bucket
    mime_type: str
    file_size_bytes: Optional[int] = None


class GenerationResult(BaseModel):
    """
    Result of a CAD generation attempt.
    IMPORTANT: artifacts list is ONLY populated when status == 'success'.
    Never populate artifacts on failure.
    """
    status: Literal["success", "failed"]
    job_id: str
    part_spec_id: str
    cad_run_id: Optional[str] = None
    engine: str = "build123d"
    generator_name: str
    generator_version: str = "1.0.0"
    normalized_params: Dict[str, Any] = Field(default_factory=dict)
    artifacts: List[ArtifactResult] = Field(default_factory=list)
    validation: Optional[ValidationReport] = None
    assumptions: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    error: Optional[str] = None
    failure_stage: Optional[str] = None
    source_code: Optional[str] = None
    duration_ms: Optional[float] = None
