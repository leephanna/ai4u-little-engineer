"""
Simple Jig Generator — build123d
Generates a rectangular drilling/assembly jig with a grid of guide holes.
Useful for consistent hole placement in wood, metal, or plastic panels.

A jig is a functional fixture. The geometry is intentionally kept minimal:
a flat plate with through-holes and optional raised drill bushings. No
cosmetic fillets are applied — filleting all bottom edges (including hole
circles) inflates the STL mesh by 15–20× and produces geometry that does
not reflect what a machinist would actually print.

Required dimensions (mm):
  - length: float       (jig length)
  - width: float        (jig width)
  - thickness: float    (jig thickness)

Optional:
  - guide_hole_diameter: float    (guide hole diameter, default 3.0)
  - hole_rows: int                (number of hole rows, default 2)
  - hole_cols: int                (number of hole columns, default 3)
  - hole_margin_mm: float         (edge margin to first hole, default 10.0)
  - bushing_height: float         (raised bushing height above plate, default 0)
"""
from typing import Any, Dict
import logging

logger = logging.getLogger(__name__)

GENERATOR_NAME = "simple_jig"
GENERATOR_VERSION = "1.1.0"  # bumped: removed mesh-bloating fillet pass

MIN_LENGTH_MM = 30.0
MIN_WIDTH_MM = 20.0
MIN_THICKNESS_MM = 3.0
MIN_HOLE_MM = 1.5


def validate_params(dims: Dict[str, Any]) -> list:
    errors = []
    length = dims.get("length")
    width = dims.get("width")
    thickness = dims.get("thickness")
    hole_d = dims.get("guide_hole_diameter", 3.0)
    margin = dims.get("hole_margin_mm", 10.0)
    cols = dims.get("hole_cols", 3)
    rows = dims.get("hole_rows", 2)

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
    if hole_d < MIN_HOLE_MM:
        errors.append(f"guide_hole_diameter {hole_d}mm is below minimum {MIN_HOLE_MM}mm")
    if length is not None and margin * 2 >= length:
        errors.append(f"hole_margin_mm ({margin}mm × 2) must be less than length ({length}mm)")
    if width is not None and margin * 2 >= width:
        errors.append(f"hole_margin_mm ({margin}mm × 2) must be less than width ({width}mm)")
    if cols < 1:
        errors.append("hole_cols must be at least 1")
    if rows < 1:
        errors.append("hole_rows must be at least 1")
    return errors


def generate(dims: Dict[str, Any], variant_type: str = "requested") -> Any:
    """Generate a simple jig using build123d. Returns a build123d Solid.

    Geometry is intentionally minimal: flat plate + guide holes (+ optional
    raised bushings). No cosmetic fillets are applied because filleting the
    bottom face's edges — which includes every hole circle — inflates the STL
    mesh from ~150 KB to ~2.5 MB without adding any functional value for a
    drilling jig.
    """
    try:
        from build123d import (
            BuildPart, Box, Cylinder,
            Mode, Align, Locations,
        )
    except ImportError as e:
        raise ImportError("build123d is not installed") from e

    errors = validate_params(dims)
    if errors:
        raise ValueError(f"Invalid simple_jig dimensions: {'; '.join(errors)}")

    length = float(dims["length"])
    width = float(dims["width"])
    thickness = float(dims["thickness"])
    hole_d = float(dims.get("guide_hole_diameter", 3.0))
    rows = int(dims.get("hole_rows", 2))
    cols = int(dims.get("hole_cols", 3))
    margin = float(dims.get("hole_margin_mm", 10.0))
    bushing_h = float(dims.get("bushing_height", 0.0))

    if variant_type == "stronger":
        thickness *= 1.3
        logger.info(f"Stronger variant: thickness increased to {thickness:.2f}mm")

    # Compute hole grid positions
    if cols == 1:
        xs = [0.0]
    else:
        x_span = length - 2 * margin
        xs = [-length / 2 + margin + i * x_span / (cols - 1) for i in range(cols)]

    if rows == 1:
        ys = [0.0]
    else:
        y_span = width - 2 * margin
        ys = [-width / 2 + margin + j * y_span / (rows - 1) for j in range(rows)]

    total_height = thickness + bushing_h

    with BuildPart() as part:
        # Base plate
        Box(length, width, thickness, align=(Align.CENTER, Align.CENTER, Align.MIN))

        # Raised bushings (if requested)
        if bushing_h > 0:
            bushing_od = hole_d + 4.0
            positions = [(x, y, thickness) for x in xs for y in ys]
            with Locations(*positions):
                Cylinder(
                    radius=bushing_od / 2,
                    height=bushing_h,
                    align=(Align.CENTER, Align.CENTER, Align.MIN),
                )

        # Guide holes (through full height)
        positions_top = [(x, y, total_height) for x in xs for y in ys]
        with Locations(*positions_top):
            Cylinder(
                radius=hole_d / 2,
                height=total_height + 0.1,
                align=(Align.CENTER, Align.CENTER, Align.MAX),
                mode=Mode.SUBTRACT,
            )

    return part.part


def get_normalized_params(dims: Dict[str, Any], variant_type: str = "requested") -> Dict[str, Any]:
    thickness = float(dims["thickness"])
    if variant_type == "stronger":
        thickness *= 1.3
    return {
        "length_mm": float(dims["length"]),
        "width_mm": float(dims["width"]),
        "thickness_mm": thickness,
        "guide_hole_diameter_mm": float(dims.get("guide_hole_diameter", 3.0)),
        "hole_rows": int(dims.get("hole_rows", 2)),
        "hole_cols": int(dims.get("hole_cols", 3)),
        "hole_margin_mm": float(dims.get("hole_margin_mm", 10.0)),
        "bushing_height_mm": float(dims.get("bushing_height", 0.0)),
        "variant_type": variant_type,
    }
