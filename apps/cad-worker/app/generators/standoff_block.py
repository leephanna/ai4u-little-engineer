"""
Standoff Block Generator — build123d
Generates a rectangular standoff block with a threaded/clearance hole
through the center for PCB mounting or panel spacing.

Required dimensions (mm):
  - height: float         (standoff height)
  - base_width: float     (square base side length)

Optional:
  - hole_diameter: float  (center hole diameter, default 3.0 for M3)
  - chamfer_top: float    (top chamfer, default 0.5)
  - shape: str            ("square" | "hex", default "square")
"""
from typing import Any, Dict
import logging

logger = logging.getLogger(__name__)

GENERATOR_NAME = "standoff_block"
GENERATOR_VERSION = "1.0.0"

MIN_HEIGHT_MM = 3.0
MIN_BASE_MM = 5.0
MIN_HOLE_MM = 1.5


def validate_params(dims: Dict[str, Any]) -> list:
    errors = []
    height = dims.get("height")
    base_width = dims.get("base_width")
    hole_diameter = dims.get("hole_diameter", 3.0)

    if height is None:
        errors.append("Missing required dimension: height")
    if base_width is None:
        errors.append("Missing required dimension: base_width")

    if height is not None and height < MIN_HEIGHT_MM:
        errors.append(f"height {height}mm is below minimum {MIN_HEIGHT_MM}mm")
    if base_width is not None and base_width < MIN_BASE_MM:
        errors.append(f"base_width {base_width}mm is below minimum {MIN_BASE_MM}mm")
    if hole_diameter < MIN_HOLE_MM:
        errors.append(f"hole_diameter {hole_diameter}mm is below minimum {MIN_HOLE_MM}mm")
    if base_width is not None and hole_diameter >= base_width - 2.0:
        errors.append(
            f"hole_diameter {hole_diameter}mm too large for base_width {base_width}mm "
            f"(min wall: 1.0mm each side)"
        )
    return errors


def generate(dims: Dict[str, Any], variant_type: str = "requested") -> Any:
    """Generate a standoff block using build123d. Returns a build123d Solid."""
    try:
        from build123d import (
            BuildPart, Box, Cylinder, RegularPolygon, extrude,
            chamfer, Mode, Align, GeomType
        )
    except ImportError as e:
        raise ImportError("build123d is not installed") from e

    errors = validate_params(dims)
    if errors:
        raise ValueError(f"Invalid standoff_block dimensions: {'; '.join(errors)}")

    height = float(dims["height"])
    base_width = float(dims["base_width"])
    hole_diameter = float(dims.get("hole_diameter", 3.0))
    chamfer_top = float(dims.get("chamfer_top", 0.5))
    shape = str(dims.get("shape", "square")).lower()

    if variant_type == "stronger":
        base_width *= 1.15
        logger.info(f"Stronger variant: base_width increased to {base_width:.2f}mm")

    with BuildPart() as part:
        if shape == "hex":
            # Hexagonal standoff
            from build123d import BuildSketch
            with BuildSketch() as sk:
                RegularPolygon(radius=base_width / 2, side_count=6)
            extrude(sk.sketch, amount=height)
        else:
            # Square standoff
            Box(
                base_width, base_width, height,
                align=(Align.CENTER, Align.CENTER, Align.MIN)
            )

        # Center through-hole
        Cylinder(
            radius=hole_diameter / 2,
            height=height + 0.1,
            align=(Align.CENTER, Align.CENTER, Align.MIN),
            mode=Mode.SUBTRACT,
        )

        # Top chamfer
        if chamfer_top > 0:
            try:
                max_ch = min(base_width / 6, height / 6, 1.5)
                top_edges = part.edges().filter_by(GeomType.CIRCLE)
                if top_edges:
                    chamfer(top_edges[-1:], length=min(chamfer_top, max_ch))
            except Exception as e:
                logger.warning(f"Chamfer skipped: {e}")

    return part.part


def get_normalized_params(dims: Dict[str, Any], variant_type: str = "requested") -> Dict[str, Any]:
    base_width = float(dims["base_width"])
    if variant_type == "stronger":
        base_width *= 1.15
    return {
        "height_mm": float(dims["height"]),
        "base_width_mm": base_width,
        "hole_diameter_mm": float(dims.get("hole_diameter", 3.0)),
        "shape": str(dims.get("shape", "square")),
        "variant_type": variant_type,
    }
