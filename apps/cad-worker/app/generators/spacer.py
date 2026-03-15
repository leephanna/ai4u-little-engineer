"""
Spacer Generator — build123d
Generates a cylindrical or tubular spacer.

Required dimensions (mm):
  - outer_diameter: float  (OD of the spacer)
  - inner_diameter: float  (ID; 0 for solid)
  - length: float          (height/length of the spacer)

Optional:
  - chamfer_top: float     (chamfer on top edge, default 0.5mm)
  - chamfer_bottom: float  (chamfer on bottom edge, default 0.5mm)
"""

from typing import Any, Dict, Optional
import logging

logger = logging.getLogger(__name__)

GENERATOR_NAME = "spacer"
GENERATOR_VERSION = "1.0.0"

# Minimum printable wall thickness for FDM
MIN_WALL_THICKNESS_MM = 1.2
# Minimum solid spacer diameter
MIN_OD_MM = 3.0
# Minimum length
MIN_LENGTH_MM = 1.0


def validate_params(dims: Dict[str, float]) -> list[str]:
    """Validate spacer dimensions. Returns list of error strings."""
    errors = []
    od = dims.get("outer_diameter")
    id_ = dims.get("inner_diameter", 0.0)
    length = dims.get("length")

    if od is None:
        errors.append("Missing required dimension: outer_diameter")
    if length is None:
        errors.append("Missing required dimension: length")

    if od is not None and od < MIN_OD_MM:
        errors.append(f"outer_diameter {od}mm is below minimum {MIN_OD_MM}mm")
    if length is not None and length < MIN_LENGTH_MM:
        errors.append(f"length {length}mm is below minimum {MIN_LENGTH_MM}mm")
    if od is not None and id_ > 0:
        wall = (od - id_) / 2
        if wall < MIN_WALL_THICKNESS_MM:
            errors.append(
                f"Wall thickness {wall:.2f}mm is below minimum {MIN_WALL_THICKNESS_MM}mm. "
                f"Reduce inner_diameter or increase outer_diameter."
            )
        if id_ >= od:
            errors.append("inner_diameter must be less than outer_diameter")

    return errors


def generate(dims: Dict[str, float], variant_type: str = "requested") -> Any:
    """
    Generate a spacer using build123d.

    Returns a build123d Solid object.
    Raises ValueError on invalid dimensions.
    Raises ImportError if build123d is not installed.
    """
    try:
        from build123d import (
            BuildPart, Cylinder, Chamfer, Mode, Axis, Select, GeomType
        )
    except ImportError as e:
        raise ImportError(
            "build123d is not installed. Install it with: pip install build123d"
        ) from e

    errors = validate_params(dims)
    if errors:
        raise ValueError(f"Invalid spacer dimensions: {'; '.join(errors)}")

    od = dims["outer_diameter"]
    id_ = dims.get("inner_diameter", 0.0)
    length = dims["length"]
    chamfer_top = dims.get("chamfer_top", 0.5)
    chamfer_bottom = dims.get("chamfer_bottom", 0.5)

    # Apply variant modifications
    if variant_type == "stronger":
        # Increase wall thickness by 25% for stronger variant
        if id_ > 0:
            wall = (od - id_) / 2
            new_wall = wall * 1.25
            id_ = od - 2 * new_wall
            id_ = max(id_, 0.0)
        logger.info(f"Stronger variant: adjusted inner_diameter to {id_:.2f}mm")
    elif variant_type == "print_optimized":
        # Reduce chamfer for better layer adhesion
        chamfer_top = min(chamfer_top, 0.3)
        chamfer_bottom = min(chamfer_bottom, 0.3)

    with BuildPart() as part:
        # Outer cylinder
        Cylinder(radius=od / 2, height=length)

        # Hollow out if inner diameter specified
        if id_ > 0:
            Cylinder(radius=id_ / 2, height=length + 0.01, mode=Mode.SUBTRACT)

        # Apply chamfers to top and bottom edges
        max_chamfer = min(od / 4, length / 4)
        if chamfer_top > 0 and chamfer_top <= max_chamfer:
            try:
                top_edges = part.edges().filter_by(Axis.Z).filter_by(GeomType.CIRCLE)
                if top_edges:
                    Chamfer(*top_edges[-1:], length=chamfer_top)
            except Exception as e:
                logger.warning(f"Could not apply top chamfer: {e}")

        if chamfer_bottom > 0 and chamfer_bottom <= max_chamfer:
            try:
                bottom_edges = part.edges().filter_by(Axis.Z).filter_by(GeomType.CIRCLE)
                if bottom_edges:
                    Chamfer(*bottom_edges[:1], length=chamfer_bottom)
            except Exception as e:
                logger.warning(f"Could not apply bottom chamfer: {e}")

    return part.part


def get_normalized_params(dims: Dict[str, float], variant_type: str = "requested") -> Dict[str, Any]:
    """Return the normalized parameters used for generation."""
    od = dims["outer_diameter"]
    id_ = dims.get("inner_diameter", 0.0)
    length = dims["length"]

    if variant_type == "stronger" and id_ > 0:
        wall = (od - id_) / 2
        new_wall = wall * 1.25
        id_ = max(od - 2 * new_wall, 0.0)

    return {
        "outer_diameter_mm": od,
        "inner_diameter_mm": id_,
        "length_mm": length,
        "wall_thickness_mm": (od - id_) / 2 if id_ > 0 else od / 2,
        "is_hollow": id_ > 0,
        "variant_type": variant_type,
    }
