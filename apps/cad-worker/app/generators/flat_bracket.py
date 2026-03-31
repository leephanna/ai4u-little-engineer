"""
Flat Bracket Generator — build123d
Generates a flat mounting bracket with optional countersunk holes.

Required dimensions (mm):
  - length: float       (overall length)
  - width: float        (overall width)
  - thickness: float    (plate thickness)

Optional:
  - hole_diameter: float    (bolt hole diameter, default 4.0)
  - hole_count: int         (number of holes along length, default 2)
  - hole_margin_mm: float   (distance from edge to hole center, default 8.0)
  - countersink: bool       (add 90° countersink, default False)
  - fillet_radius: float    (corner fillet radius, default 1.0)
"""
from typing import Any, Dict
import logging

logger = logging.getLogger(__name__)

GENERATOR_NAME = "flat_bracket"
GENERATOR_VERSION = "1.0.0"

MIN_LENGTH_MM = 20.0
MIN_WIDTH_MM = 10.0
MIN_THICKNESS_MM = 1.5
MIN_HOLE_DIAMETER_MM = 2.0


def validate_params(dims: Dict[str, Any]) -> list:
    errors = []
    length = dims.get("length")
    width = dims.get("width")
    thickness = dims.get("thickness")
    hole_diameter = dims.get("hole_diameter", 4.0)
    hole_count = dims.get("hole_count", 2)
    hole_margin = dims.get("hole_margin_mm", 8.0)

    if length is None:
        errors.append("Missing required dimension: length")
    if width is None:
        errors.append("Missing required dimension: width")
    if thickness is None:
        errors.append("Missing required dimension: thickness")

    if length is not None and length < MIN_LENGTH_MM:
        errors.append(f"length {length}mm is below minimum {MIN_LENGTH_MM}mm")
    if width is not None and width < MIN_WIDTH_MM:
        errors.append(f"width {width}mm is below minimum {MIN_WIDTH_MM}mm")
    if thickness is not None and thickness < MIN_THICKNESS_MM:
        errors.append(f"thickness {thickness}mm is below minimum {MIN_THICKNESS_MM}mm")
    if hole_diameter < MIN_HOLE_DIAMETER_MM:
        errors.append(f"hole_diameter {hole_diameter}mm is below minimum {MIN_HOLE_DIAMETER_MM}mm")
    if hole_count < 1:
        errors.append("hole_count must be at least 1")
    if length is not None and hole_margin * 2 >= length:
        errors.append(
            f"hole_margin_mm ({hole_margin}mm × 2) must be less than length ({length}mm)"
        )
    return errors


def generate(dims: Dict[str, Any], variant_type: str = "requested") -> Any:
    """Generate a flat bracket using build123d. Returns a build123d Solid."""
    try:
        from build123d import (
            BuildPart, Box, Cylinder, fillet,
            Mode, Align, Locations
        )
        # CounterSinkHole is the correct name in build123d 0.9.0
        import build123d as bd
    except ImportError as e:
        raise ImportError("build123d is not installed") from e

    errors = validate_params(dims)
    if errors:
        raise ValueError(f"Invalid flat_bracket dimensions: {'; '.join(errors)}")

    length = float(dims["length"])
    width = float(dims["width"])
    thickness = float(dims["thickness"])
    hole_diameter = float(dims.get("hole_diameter", 4.0))
    hole_count = int(dims.get("hole_count", 2))
    hole_margin = float(dims.get("hole_margin_mm", 8.0))
    fillet_r = float(dims.get("fillet_radius", 1.0))

    # Stronger variant: increase thickness by 25%
    if variant_type == "stronger":
        thickness *= 1.25
        logger.info(f"Stronger variant: thickness increased to {thickness:.2f}mm")

    # Print-optimized: reduce thickness slightly, keep holes
    if variant_type == "print_optimized":
        thickness = max(MIN_THICKNESS_MM, thickness * 0.9)

    with BuildPart() as part:
        # Base plate
        Box(length, width, thickness, align=(Align.CENTER, Align.CENTER, Align.MIN))

        # Fillets on top edges
        if fillet_r > 0:
            try:
                top_edges = part.edges().filter_by_position(
                    axis=bd.Axis.Z, minimum=thickness * 0.9, maximum=thickness * 1.1
                )
                if top_edges:
                    fillet(top_edges, radius=min(fillet_r, thickness / 3))
            except Exception as e:
                logger.warning(f"Fillet skipped: {e}")

        # Bolt holes
        if hole_count == 1:
            hole_positions = [(0.0, 0.0)]
        else:
            step = (length - 2 * hole_margin) / (hole_count - 1)
            start_x = -length / 2 + hole_margin
            hole_positions = [(start_x + i * step, 0.0) for i in range(hole_count)]

        with Locations(*[(x, y, thickness) for x, y in hole_positions]):
            Cylinder(
                radius=hole_diameter / 2,
                height=thickness + 0.1,
                align=(Align.CENTER, Align.CENTER, Align.MAX),
                mode=Mode.SUBTRACT,
            )

    return part.part


def get_normalized_params(dims: Dict[str, Any], variant_type: str = "requested") -> Dict[str, Any]:
    thickness = float(dims["thickness"])
    if variant_type == "stronger":
        thickness *= 1.25
    return {
        "length_mm": float(dims["length"]),
        "width_mm": float(dims["width"]),
        "thickness_mm": thickness,
        "hole_diameter_mm": float(dims.get("hole_diameter", 4.0)),
        "hole_count": int(dims.get("hole_count", 2)),
        "hole_margin_mm": float(dims.get("hole_margin_mm", 8.0)),
        "countersink": bool(dims.get("countersink", False)),
        "variant_type": variant_type,
    }
