"""
Pydantic schemas for PartSpec — the structured representation of a part request.
"""

from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field, field_validator


SUPPORTED_FAMILIES = [
    "spacer",
    "flat_bracket",
    "l_bracket",
    "u_bracket",
    "hole_plate",
    "standoff_block",
    "cable_clip",
    "enclosure",
    "adapter_bushing",
    "simple_jig",
]

SUPPORTED_UNITS = Literal["mm", "in"]
SUPPORTED_MATERIALS = [
    "PLA", "PETG", "ABS", "ASA", "TPU", "Nylon", "PEEK",
    "Aluminum", "Steel", "Unknown",
]


class LoadRequirements(BaseModel):
    estimated_static_load_lbs: Optional[float] = None
    shock_load: bool = False
    dynamic_load: bool = False


class PartConstraints(BaseModel):
    must_fit_within: Optional[List[float]] = None  # [x, y, z] in mm
    support_preference: Optional[str] = "minimal"
    fastener_standard: Optional[str] = None


class PrinterConstraints(BaseModel):
    max_print_volume: Optional[List[float]] = None  # [x, y, z] in mm
    layer_height: Optional[float] = None
    nozzle_size: Optional[float] = None
    infill_percent: Optional[float] = None


class PartSpec(BaseModel):
    """
    Structured specification for a part to be generated.
    All dimensions are stored in mm after normalization.
    """
    family: str = Field(..., description="Part family from supported list")
    units: SUPPORTED_UNITS = Field(default="mm", description="Input units (normalized to mm at ingress)")
    material: Optional[str] = Field(default="Unknown")
    dimensions: Dict[str, float] = Field(default_factory=dict)
    load_requirements: LoadRequirements = Field(default_factory=LoadRequirements)
    constraints: PartConstraints = Field(default_factory=PartConstraints)
    printer_constraints: PrinterConstraints = Field(default_factory=PrinterConstraints)
    assumptions: List[str] = Field(default_factory=list)
    missing_fields: List[str] = Field(default_factory=list)

    @field_validator("material", mode="before")
    @classmethod
    def coerce_material(cls, v: object) -> str:
        """Accept null/None and coerce to 'Unknown'."""
        if v is None:
            return "Unknown"
        return str(v)

    @field_validator("family")
    @classmethod
    def validate_family(cls, v: str) -> str:
        if v not in SUPPORTED_FAMILIES:
            raise ValueError(
                f"Unsupported part family '{v}'. "
                f"Supported families: {', '.join(SUPPORTED_FAMILIES)}"
            )
        return v

    def normalize_to_mm(self) -> "PartSpec":
        """Convert all dimensions to mm if units are inches."""
        if self.units == "in":
            normalized = {k: v * 25.4 for k, v in self.dimensions.items()}
            return self.model_copy(
                update={
                    "dimensions": normalized,
                    "units": "mm",
                    "assumptions": self.assumptions + [
                        f"All dimensions converted from inches to mm (×25.4)"
                    ],
                }
            )
        return self

    def get_dimension(self, key: str, default: Optional[float] = None) -> Optional[float]:
        """Safely retrieve a dimension value."""
        return self.dimensions.get(key, default)
