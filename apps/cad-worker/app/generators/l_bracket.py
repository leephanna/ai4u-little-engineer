"""
L-Bracket Generator — build123d
Generates an L-shaped bracket for corner mounting.

Required dimensions (mm):
  - leg_a: float        (length of first leg)
  - leg_b: float        (length of second leg)
  - thickness: float    (material thickness)
  - width: float        (width of the bracket)

Optional:
  - hole_diameter: float   (mounting hole diameter, default 5.5mm for M5)
  - hole_count: int        (holes per leg, default 2)
  - hole_spacing: float    (center-to-center hole spacing, default auto)
  - fillet_radius: float   (inner corner fillet, default 2.0mm)
  - hole_oversize: float   (FDM oversize for hole fit, default 0.2mm)
"""

from typing import Any, Dict
import logging

logger = logging.getLogger(__name__)

GENERATOR_NAME = "l_bracket"
GENERATOR_VERSION = "1.0.0"

MIN_THICKNESS_MM = 2.0
MIN_LEG_MM = 10.0
MIN_WIDTH_MM = 10.0
DEFAULT_HOLE_DIAMETER_MM = 5.5  # M5 clearance
DEFAULT_FILLET_MM = 2.0
FDM_HOLE_OVERSIZE_MM = 0.2  # Standard FDM oversize for fit


def _leg_a(dims: Dict[str, Any]) -> Any:
    """Accept canonical 'leg_a' or alias 'arm1_length'."""
    return dims.get("leg_a") if dims.get("leg_a") is not None else dims.get("arm1_length")


def _leg_b(dims: Dict[str, Any]) -> Any:
    """Accept canonical 'leg_b' or alias 'arm2_length'."""
    return dims.get("leg_b") if dims.get("leg_b") is not None else dims.get("arm2_length")


def validate_params(dims: Dict[str, Any]) -> list:
    errors = []
    la = _leg_a(dims)
    lb = _leg_b(dims)
    if la is None:
        errors.append("Missing required dimension: leg_a")
    if lb is None:
        errors.append("Missing required dimension: leg_b")
    if dims.get("thickness") is None:
        errors.append("Missing required dimension: thickness")
    if dims.get("width") is None:
        errors.append("Missing required dimension: width")
    if dims.get("thickness") and dims["thickness"] < MIN_THICKNESS_MM:
        errors.append(f"thickness {dims['thickness']}mm below minimum {MIN_THICKNESS_MM}mm")
    if la and la < MIN_LEG_MM:
        errors.append(f"leg_a {la}mm below minimum {MIN_LEG_MM}mm")
    if lb and lb < MIN_LEG_MM:
        errors.append(f"leg_b {lb}mm below minimum {MIN_LEG_MM}mm")
    if dims.get("width") and dims["width"] < MIN_WIDTH_MM:
        errors.append(f"width {dims['width']}mm below minimum {MIN_WIDTH_MM}mm")
    return errors


def generate(dims: Dict[str, Any], variant_type: str = "requested") -> Any:
    """Generate an L-bracket using build123d."""
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
        raise ValueError(f"Invalid L-bracket dimensions: {'; '.join(errors)}")

    leg_a = _leg_a(dims)
    leg_b = _leg_b(dims)
    thickness = dims["thickness"]
    width = dims["width"]
    hole_diameter = dims.get("hole_diameter", DEFAULT_HOLE_DIAMETER_MM)
    hole_count = int(dims.get("hole_count", 2))
    fillet_radius = dims.get("fillet_radius", DEFAULT_FILLET_MM)
    hole_oversize = dims.get("hole_oversize", FDM_HOLE_OVERSIZE_MM)

    # Apply FDM oversize to holes
    actual_hole_d = hole_diameter + hole_oversize

    # Variant modifications
    if variant_type == "stronger":
        thickness = thickness * 1.5
        fillet_radius = fillet_radius * 1.5
        logger.info(f"Stronger variant: thickness={thickness:.2f}mm, fillet={fillet_radius:.2f}mm")
    elif variant_type == "print_optimized":
        # Use chamfer instead of fillet for better layer adhesion
        fillet_radius = 0  # Will use chamfer instead

    with BuildPart() as part:
        # Leg A: horizontal (along X axis)
        with Locations(Location((leg_a / 2, 0, thickness / 2))):
            Box(leg_a, width, thickness)

        # Leg B: vertical (along Z axis)
        with Locations(Location((0, 0, leg_b / 2 + thickness))):
            Box(thickness, width, leg_b)

        # Add mounting holes to leg A
        if hole_count > 0 and actual_hole_d > 0:
            hole_spacing_a = dims.get("hole_spacing", (leg_a - 2 * actual_hole_d) / max(hole_count - 1, 1))
            start_x = actual_hole_d
            for i in range(hole_count):
                hx = start_x + i * hole_spacing_a
                if hx <= leg_a - actual_hole_d / 2:
                    with Locations(Location((hx, width / 2, 0))):
                        Cylinder(
                            radius=actual_hole_d / 2,
                            height=thickness + 0.1,
                            mode=Mode.SUBTRACT,
                        )

        # Add mounting holes to leg B
        if hole_count > 0 and actual_hole_d > 0:
            hole_spacing_b = dims.get("hole_spacing", (leg_b - 2 * actual_hole_d) / max(hole_count - 1, 1))
            start_z = thickness + actual_hole_d
            for i in range(hole_count):
                hz = start_z + i * hole_spacing_b
                if hz <= leg_b + thickness - actual_hole_d / 2:
                    with Locations(Location((0, width / 2, hz))):
                        Cylinder(
                            radius=actual_hole_d / 2,
                            height=thickness + 0.1,
                            align=(bd.Align.CENTER, bd.Align.CENTER, bd.Align.CENTER),
                            rotation=(0, 90, 0),
                            mode=Mode.SUBTRACT,
                        )

        # Apply fillet to inner corner
        if fillet_radius > 0:
            try:
                inner_edges = (
                    part.edges()
                    .filter_by(Axis.Y)
                    .filter_by_position(Axis.X, -thickness / 2, thickness / 2)
                )
                if inner_edges:
                    fillet(inner_edges, radius=min(fillet_radius, thickness * 0.4))
            except Exception as e:
                logger.warning(f"Inner fillet skipped: {e}")

    return part.part


def get_normalized_params(dims: Dict[str, Any], variant_type: str = "requested") -> Dict[str, Any]:
    thickness = dims["thickness"]
    if variant_type == "stronger":
        thickness = thickness * 1.5

    hole_diameter = dims.get("hole_diameter", DEFAULT_HOLE_DIAMETER_MM)
    hole_oversize = dims.get("hole_oversize", FDM_HOLE_OVERSIZE_MM)

    return {
        "leg_a_mm": _leg_a(dims),
        "leg_b_mm": _leg_b(dims),
        "thickness_mm": thickness,
        "width_mm": dims["width"],
        "hole_diameter_mm": hole_diameter,
        "actual_hole_diameter_mm": hole_diameter + hole_oversize,
        "hole_count": int(dims.get("hole_count", 2)),
        "fillet_radius_mm": dims.get("fillet_radius", DEFAULT_FILLET_MM),
        "hole_oversize_applied_mm": hole_oversize,
        "variant_type": variant_type,
    }
