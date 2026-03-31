"""
Hole Plate / Mounting Plate Generator — build123d
Generates a flat plate with a pattern of mounting holes.

Required dimensions (mm):
  - length: float         (plate length)
  - width: float          (plate width)
  - thickness: float      (plate thickness)
  - hole_count: int       (total number of holes)
  - hole_diameter: float  (hole diameter)

Optional:
  - hole_pattern: str     ("grid" | "linear" | "corner", default "corner")
  - hole_margin: float    (distance from edge to hole center, default 8.0mm)
  - hole_spacing_x: float (X spacing for grid pattern)
  - hole_spacing_y: float (Y spacing for grid pattern)
  - countersink: bool     (add countersink, default False)
  - fillet_corners: float (corner fillet radius, default 3.0mm)
  - hole_oversize: float  (FDM oversize, default 0.2mm)
"""

from typing import Any, Dict, List, Tuple
import logging
import math

logger = logging.getLogger(__name__)

GENERATOR_NAME = "hole_plate"
GENERATOR_VERSION = "1.0.0"

MIN_THICKNESS_MM = 1.5
MIN_DIMENSION_MM = 10.0
DEFAULT_HOLE_MARGIN_MM = 8.0
DEFAULT_FILLET_MM = 3.0
FDM_HOLE_OVERSIZE_MM = 0.2


def validate_params(dims: Dict[str, float]) -> list[str]:
    errors = []
    for field in ["length", "width", "thickness", "hole_count", "hole_diameter"]:
        if dims.get(field) is None:
            errors.append(f"Missing required dimension: {field}")

    if dims.get("thickness") and dims["thickness"] < MIN_THICKNESS_MM:
        errors.append(f"thickness {dims['thickness']}mm below minimum {MIN_THICKNESS_MM}mm")
    if dims.get("length") and dims["length"] < MIN_DIMENSION_MM:
        errors.append(f"length {dims['length']}mm below minimum {MIN_DIMENSION_MM}mm")
    if dims.get("width") and dims["width"] < MIN_DIMENSION_MM:
        errors.append(f"width {dims['width']}mm below minimum {MIN_DIMENSION_MM}mm")

    return errors


def _compute_hole_positions(
    length: float,
    width: float,
    hole_count: int,
    hole_d: float,
    pattern: str,
    margin: float,
    spacing_x: float,
    spacing_y: float,
) -> List[Tuple[float, float]]:
    """Compute (x, y) hole center positions."""
    positions = []

    if pattern == "corner" or hole_count <= 4:
        # Place holes at corners
        corners = [
            (-length / 2 + margin, -width / 2 + margin),
            (length / 2 - margin, -width / 2 + margin),
            (length / 2 - margin, width / 2 - margin),
            (-length / 2 + margin, width / 2 - margin),
        ]
        positions = corners[:hole_count]

    elif pattern == "linear":
        # Linear row along length
        if hole_count == 1:
            positions = [(0, 0)]
        else:
            step = (length - 2 * margin) / (hole_count - 1)
            for i in range(hole_count):
                positions.append((-length / 2 + margin + i * step, 0))

    elif pattern == "grid":
        # Grid pattern
        cols = max(1, int(math.sqrt(hole_count)))
        rows = math.ceil(hole_count / cols)
        sx = spacing_x if spacing_x > 0 else (length - 2 * margin) / max(cols - 1, 1)
        sy = spacing_y if spacing_y > 0 else (width - 2 * margin) / max(rows - 1, 1)
        for r in range(rows):
            for c in range(cols):
                if len(positions) >= hole_count:
                    break
                x = -length / 2 + margin + c * sx
                y = -width / 2 + margin + r * sy
                positions.append((x, y))

    return positions


def generate(dims: Dict[str, float], variant_type: str = "requested") -> Any:
    """Generate a hole plate using build123d."""
    try:
        from build123d import (
            BuildPart, Box, Cylinder, fillet, Mode,
            Location, Locations, Axis
        )
    except ImportError as e:
        raise ImportError("build123d is not installed") from e

    errors = validate_params(dims)
    if errors:
        raise ValueError(f"Invalid hole plate dimensions: {'; '.join(errors)}")

    length = dims["length"]
    width = dims["width"]
    thickness = dims["thickness"]
    hole_count = int(dims["hole_count"])
    hole_d = dims["hole_diameter"]
    pattern = dims.get("hole_pattern", "corner")
    margin = dims.get("hole_margin", DEFAULT_HOLE_MARGIN_MM)
    spacing_x = dims.get("hole_spacing_x", 0)
    spacing_y = dims.get("hole_spacing_y", 0)
    fillet_r = dims.get("fillet_corners", DEFAULT_FILLET_MM)
    hole_oversize = dims.get("hole_oversize", FDM_HOLE_OVERSIZE_MM)

    actual_hole_d = hole_d + hole_oversize

    # Variant modifications
    if variant_type == "stronger":
        thickness = thickness * 1.5
    elif variant_type == "print_optimized":
        # Reduce fillet for better bed adhesion
        fillet_r = min(fillet_r, 1.5)

    positions = _compute_hole_positions(
        length, width, hole_count, actual_hole_d, pattern, margin, spacing_x, spacing_y
    )

    with BuildPart() as part:
        # Base plate
        Box(length, width, thickness)

        # Drill holes
        for (hx, hy) in positions:
            with Locations(Location((hx, hy, 0))):
                Cylinder(
                    radius=actual_hole_d / 2,
                    height=thickness + 0.1,
                    mode=Mode.SUBTRACT,
                )

        # Corner fillets
        if fillet_r > 0:
            try:
                vertical_edges = part.edges().filter_by(Axis.Z)
                if vertical_edges:
                    fillet(vertical_edges, radius=min(fillet_r, min(length, width) * 0.1))
            except Exception as e:
                logger.warning(f"Could not apply corner fillets: {e}")

    return part.part


def get_normalized_params(dims: Dict[str, float], variant_type: str = "requested") -> Dict[str, Any]:
    thickness = dims["thickness"]
    if variant_type == "stronger":
        thickness = thickness * 1.5

    hole_d = dims["hole_diameter"]
    hole_oversize = dims.get("hole_oversize", FDM_HOLE_OVERSIZE_MM)

    return {
        "length_mm": dims["length"],
        "width_mm": dims["width"],
        "thickness_mm": thickness,
        "hole_count": int(dims["hole_count"]),
        "hole_diameter_mm": hole_d,
        "actual_hole_diameter_mm": hole_d + hole_oversize,
        "hole_pattern": dims.get("hole_pattern", "corner"),
        "hole_margin_mm": dims.get("hole_margin", DEFAULT_HOLE_MARGIN_MM),
        "fillet_corners_mm": dims.get("fillet_corners", DEFAULT_FILLET_MM),
        "variant_type": variant_type,
    }
