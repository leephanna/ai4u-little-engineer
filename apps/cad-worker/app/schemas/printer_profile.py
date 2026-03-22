"""
Printer profile schema for the CAD worker.
Passed in the generation request so generators can apply
dimensional compensation and tolerance-aware sizing.
"""
from typing import Optional
from pydantic import BaseModel, Field


class PrinterProfile(BaseModel):
    """Printer configuration that affects generated geometry."""

    # Dimensional compensation (mm) — applied to hole radii
    xy_compensation_mm: float = Field(default=0.0, ge=-2.0, le=2.0)
    z_compensation_mm: float = Field(default=0.0, ge=-2.0, le=2.0)

    # Layer height — used for print time estimation and min feature sizing
    layer_height_mm: float = Field(default=0.2, gt=0.0, le=0.8)

    # Nozzle diameter — used for min wall thickness validation
    nozzle_diameter_mm: float = Field(default=0.4, gt=0.0, le=2.0)

    # Wall thickness preference
    wall_thickness_mm: float = Field(default=1.2, gt=0.0, le=10.0)

    # Infill percentage
    infill_percent: int = Field(default=20, ge=5, le=100)

    # Material
    material: str = Field(default="PLA")

    # Temperatures
    hotend_temp_c: int = Field(default=215, ge=0, le=400)
    bed_temp_c: int = Field(default=60, ge=0, le=200)

    # Build volume (mm) — used to warn if part exceeds printer capacity
    build_x_mm: Optional[float] = None
    build_y_mm: Optional[float] = None
    build_z_mm: Optional[float] = None

    def apply_xy_compensation(self, diameter_mm: float) -> float:
        """
        Adjust a hole diameter for XY compensation.
        Positive compensation expands holes (makes them bigger).
        """
        return max(0.1, diameter_mm + self.xy_compensation_mm * 2)

    def fits_in_build_volume(self, x: float, y: float, z: float) -> bool:
        """Return True if the part fits within the printer's build volume."""
        if self.build_x_mm and x > self.build_x_mm:
            return False
        if self.build_y_mm and y > self.build_y_mm:
            return False
        if self.build_z_mm and z > self.build_z_mm:
            return False
        return True

    def min_wall_thickness(self) -> float:
        """Minimum printable wall thickness based on nozzle diameter."""
        return max(self.nozzle_diameter_mm * 2, 0.8)
