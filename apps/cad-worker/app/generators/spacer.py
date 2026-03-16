"""
Spacer / Standoff Generator — build123d

Generates a cylindrical or tubular spacer.

Required dimensions (mm):
  - outer_diameter: float  (OD of the spacer)
  - height: float          (height of the spacer)  ← canonical key per REQUIRED_DIMENSIONS
Optional:
  - inner_diameter: float  (ID; omit or 0 for solid)
  - chamfer_top: float     (chamfer on top edge, default 0.5mm)
  - chamfer_bottom: float  (chamfer on bottom edge, default 0.5mm)

Note: "length" is accepted as a legacy alias for "height".
"""
from typing import Any, Dict
import logging

logger = logging.getLogger(__name__)

GENERATOR_NAME = "spacer"
GENERATOR_VERSION = "1.0.0"

MIN_WALL_THICKNESS_MM = 1.2
MIN_OD_MM = 3.0
MIN_HEIGHT_MM = 1.0


def _height(dims: Dict[str, Any]) -> Any:
    """Return height value, accepting canonical 'height' or legacy 'length'."""
    return dims.get("height") if dims.get("height") is not None else dims.get("length")


def validate_params(dims: Dict[str, Any]) -> list:
    errors = []
    od = dims.get("outer_diameter")
    id_ = dims.get("inner_diameter") or 0.0
    h = _height(dims)

    if od is None:
        errors.append("Missing required dimension: outer_diameter")
    if h is None:
        errors.append("Missing required dimension: height")
    if od is not None and od < MIN_OD_MM:
        errors.append(f"outer_diameter {od}mm is below minimum {MIN_OD_MM}mm")
    if h is not None and h < MIN_HEIGHT_MM:
        errors.append(f"height {h}mm is below minimum {MIN_HEIGHT_MM}mm")
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


def generate(dims: Dict[str, Any], variant_type: str = "requested") -> Any:
    """Generate a spacer using build123d. Returns a build123d Solid object."""
    try:
        from build123d import BuildPart, Cylinder, chamfer, Mode, GeomType
    except ImportError as e:
        raise ImportError("build123d is not installed") from e

    errors = validate_params(dims)
    if errors:
        raise ValueError(f"Invalid spacer dimensions: {'; '.join(errors)}")

    od = dims["outer_diameter"]
    id_ = dims.get("inner_diameter") or 0.0
    h = _height(dims)
    chamfer_top = dims.get("chamfer_top", 0.5)
    chamfer_bottom = dims.get("chamfer_bottom", 0.5)

    if variant_type == "stronger":
        if id_ > 0:
            wall = (od - id_) / 2
            id_ = max(od - 2 * wall * 1.25, 0.0)
        logger.info(f"Stronger variant: adjusted inner_diameter to {id_:.2f}mm")
    elif variant_type == "print_optimized":
        chamfer_top = min(chamfer_top, 0.3)
        chamfer_bottom = min(chamfer_bottom, 0.3)

    with BuildPart() as part:
        Cylinder(radius=od / 2, height=h)
        if id_ > 0:
            Cylinder(radius=id_ / 2, height=h + 0.01, mode=Mode.SUBTRACT)

        max_ch = min(od / 4, h / 4, 1.0)
        if chamfer_top > 0 and chamfer_top <= max_ch:
            try:
                edges = part.edges().filter_by(GeomType.CIRCLE)
                if edges:
                    chamfer(edges[-1:], length=chamfer_top)
            except Exception as e:
                logger.warning(f"Top chamfer skipped: {e}")

        if chamfer_bottom > 0 and chamfer_bottom <= max_ch:
            try:
                edges2 = part.edges().filter_by(GeomType.CIRCLE)
                if edges2:
                    chamfer(edges2[:1], length=chamfer_bottom)
            except Exception as e:
                logger.warning(f"Bottom chamfer skipped: {e}")

    return part.part


def get_normalized_params(dims: Dict[str, Any], variant_type: str = "requested") -> Dict[str, Any]:
    od = dims["outer_diameter"]
    id_ = dims.get("inner_diameter") or 0.0
    h = _height(dims)
    if variant_type == "stronger" and id_ > 0:
        wall = (od - id_) / 2
        id_ = max(od - 2 * wall * 1.25, 0.0)
    return {
        "outer_diameter_mm": od,
        "inner_diameter_mm": id_,
        "height_mm": h,
        "wall_thickness_mm": (od - id_) / 2 if id_ > 0 else od / 2,
        "is_hollow": id_ > 0,
        "variant_type": variant_type,
    }
