"""
U-Bracket / Saddle Clamp Generator — build123d
Generates a U-shaped saddle clamp for securing pipes or round profiles.

Required dimensions (mm):
  - pipe_od: float          (outer diameter of the pipe to clamp)
  - wall_thickness: float   (bracket wall thickness)
  - flange_width: float     (width of the mounting flanges)
  - flange_length: float    (length of the mounting flanges)

Optional:
  - hole_diameter: float    (mounting hole diameter, default 6.5mm for M6)
  - hole_count: int         (holes per flange, default 1)
  - hole_spacing: float     (hole center-to-center, default auto)
  - fillet_radius: float    (inner fillet radius, default 3.0mm)
  - clearance: float        (extra clearance on pipe OD, default 0.5mm)
  - hole_oversize: float    (FDM hole oversize, default 0.2mm)
"""

from typing import Any, Dict
import logging
import math

logger = logging.getLogger(__name__)

GENERATOR_NAME = "u_bracket"
GENERATOR_VERSION = "1.0.0"

MIN_WALL_THICKNESS_MM = 2.0
MIN_FLANGE_MM = 15.0
DEFAULT_HOLE_DIAMETER_MM = 6.5  # M6 clearance
DEFAULT_FILLET_MM = 3.0
DEFAULT_CLEARANCE_MM = 0.5
FDM_HOLE_OVERSIZE_MM = 0.2


def validate_params(dims: Dict[str, float]) -> list[str]:
    errors = []
    for field in ["pipe_od", "wall_thickness", "flange_width", "flange_length"]:
        if dims.get(field) is None:
            errors.append(f"Missing required dimension: {field}")

    if dims.get("wall_thickness") and dims["wall_thickness"] < MIN_WALL_THICKNESS_MM:
        errors.append(
            f"wall_thickness {dims['wall_thickness']}mm below minimum {MIN_WALL_THICKNESS_MM}mm"
        )
    if dims.get("pipe_od") and dims["pipe_od"] <= 0:
        errors.append("pipe_od must be positive")
    if dims.get("flange_width") and dims["flange_width"] < MIN_FLANGE_MM:
        errors.append(f"flange_width {dims['flange_width']}mm below minimum {MIN_FLANGE_MM}mm")

    return errors


def generate(dims: Dict[str, float], variant_type: str = "requested") -> Any:
    """Generate a U-bracket saddle clamp using build123d."""
    try:
        from build123d import (
            BuildPart, Box, Cylinder, fillet, Mode,
            Location, Locations, Axis
        )
        import build123d as bd
    except ImportError as e:
        raise ImportError("build123d is not installed") from e

    errors = validate_params(dims)
    if errors:
        raise ValueError(f"Invalid U-bracket dimensions: {'; '.join(errors)}")

    pipe_od = dims["pipe_od"]
    wall = dims["wall_thickness"]
    flange_w = dims["flange_width"]
    flange_l = dims["flange_length"]
    hole_d = dims.get("hole_diameter", DEFAULT_HOLE_DIAMETER_MM)
    hole_count = int(dims.get("hole_count", 1))
    fillet_r = dims.get("fillet_radius", DEFAULT_FILLET_MM)
    clearance = dims.get("clearance", DEFAULT_CLEARANCE_MM)
    hole_oversize = dims.get("hole_oversize", FDM_HOLE_OVERSIZE_MM)

    # Effective pipe radius with clearance
    pipe_r = (pipe_od + clearance) / 2
    actual_hole_d = hole_d + hole_oversize

    # Variant modifications
    if variant_type == "stronger":
        wall = wall * 1.5
        fillet_r = fillet_r * 1.2
        logger.info(f"Stronger variant: wall={wall:.2f}mm")
    elif variant_type == "print_optimized":
        # Reduce clearance slightly for tighter fit (better for print-in-place)
        clearance = max(clearance * 0.8, 0.3)
        pipe_r = (pipe_od + clearance) / 2

    # Total bracket dimensions
    total_width = pipe_od + 2 * wall + 2 * clearance
    total_height = pipe_r + wall  # Half-pipe height + wall
    total_length = flange_l

    with BuildPart() as part:
        # Base block
        Box(total_width, total_length, total_height)

        # Subtract the pipe channel (semicircle cutout from top)
        # The channel runs along the Y axis (length direction)
        with Locations(Location((0, 0, total_height))):
            Cylinder(
                radius=pipe_r,
                height=total_length + 0.1,
                rotation=(90, 0, 0),
                mode=Mode.SUBTRACT,
            )

        # Mounting holes in flanges
        if hole_count > 0 and actual_hole_d > 0:
            flange_zone_x = (total_width / 2 - flange_w / 2)
            hole_positions_x = [
                -(total_width / 2 - flange_w / 2),
                (total_width / 2 - flange_w / 2),
            ]

            hole_spacing_y = flange_l / (hole_count + 1)
            for hx in hole_positions_x:
                for i in range(hole_count):
                    hy = -flange_l / 2 + hole_spacing_y * (i + 1)
                    with Locations(Location((hx, hy, 0))):
                        Cylinder(
                            radius=actual_hole_d / 2,
                            height=total_height + 0.1,
                            mode=Mode.SUBTRACT,
                        )

        # Apply fillet to pipe channel edges
        if fillet_r > 0:
            try:
                channel_edges = part.edges().filter_by(Axis.Y)
                if channel_edges:
                    fillet(channel_edges[:2], radius=min(fillet_r, wall * 0.4))
            except Exception as e:
                logger.warning(f"Channel fillet skipped: {e}")

    return part.part


def get_normalized_params(dims: Dict[str, float], variant_type: str = "requested") -> Dict[str, Any]:
    wall = dims["wall_thickness"]
    clearance = dims.get("clearance", DEFAULT_CLEARANCE_MM)

    if variant_type == "stronger":
        wall = wall * 1.5
    elif variant_type == "print_optimized":
        clearance = max(clearance * 0.8, 0.3)

    hole_d = dims.get("hole_diameter", DEFAULT_HOLE_DIAMETER_MM)
    hole_oversize = dims.get("hole_oversize", FDM_HOLE_OVERSIZE_MM)

    return {
        "pipe_od_mm": dims["pipe_od"],
        "wall_thickness_mm": wall,
        "flange_width_mm": dims["flange_width"],
        "flange_length_mm": dims["flange_length"],
        "clearance_mm": clearance,
        "hole_diameter_mm": hole_d,
        "actual_hole_diameter_mm": hole_d + hole_oversize,
        "hole_count": int(dims.get("hole_count", 1)),
        "fillet_radius_mm": dims.get("fillet_radius", DEFAULT_FILLET_MM),
        "variant_type": variant_type,
    }
