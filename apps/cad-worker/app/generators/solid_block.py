"""
Solid Block Generator — build123d
Generates a true solid rectangular block / cube with no holes.

Use for:
  - Cubes ("make a cube with 5mm sides")
  - Rectangular prisms / boxes ("make a 20×30×10mm block")
  - Any solid block where no through-hole is required

Do NOT use for:
  - Standoffs (use standoff_block — requires base_width + hole_diameter)
  - Spacers (use spacer — requires outer_diameter + inner_diameter)

Required dimensions (mm):
  - length: float   (X dimension)
  - width:  float   (Y dimension)
  - height: float   (Z dimension)

Optional:
  - chamfer: float  (edge chamfer, default 0 = no chamfer)
"""
from typing import Any, Dict
import logging

logger = logging.getLogger(__name__)

GENERATOR_NAME = "solid_block"
GENERATOR_VERSION = "1.0.0"

MIN_DIM_MM = 1.0
MAX_DIM_MM = 500.0


def validate_params(dims: Dict[str, Any]) -> list:
    errors = []
    length = dims.get("length")
    width = dims.get("width")
    height = dims.get("height")

    if length is None:
        errors.append("Missing required dimension: length")
    if width is None:
        errors.append("Missing required dimension: width")
    if height is None:
        errors.append("Missing required dimension: height")

    for name, val in [("length", length), ("width", width), ("height", height)]:
        if val is not None:
            if val < MIN_DIM_MM:
                errors.append(f"{name} {val}mm is below minimum {MIN_DIM_MM}mm")
            if val > MAX_DIM_MM:
                errors.append(f"{name} {val}mm exceeds maximum {MAX_DIM_MM}mm")

    return errors


def generate(dims: Dict[str, Any], variant_type: str = "requested") -> Any:
    """Generate a solid rectangular block using build123d. Returns a build123d Solid."""
    try:
        from build123d import BuildPart, Box, Align, chamfer as b123_chamfer, GeomType
    except ImportError as e:
        raise ImportError("build123d is not installed") from e

    errors = validate_params(dims)
    if errors:
        raise ValueError(f"Invalid solid_block dimensions: {'; '.join(errors)}")

    length = float(dims["length"])
    width = float(dims["width"])
    height = float(dims["height"])
    chamfer_size = float(dims.get("chamfer", 0.0))

    if variant_type == "stronger":
        # Stronger variant: scale up all dims by 15%
        length *= 1.15
        width *= 1.15
        height *= 1.15
        logger.info(f"Stronger variant: dims scaled to {length:.2f}×{width:.2f}×{height:.2f}mm")

    with BuildPart() as part:
        Box(
            length, width, height,
            align=(Align.CENTER, Align.CENTER, Align.MIN)
        )

        # Optional chamfer on all edges
        if chamfer_size > 0:
            try:
                max_ch = min(length, width, height) / 4
                safe_ch = min(chamfer_size, max_ch)
                if safe_ch > 0.1:
                    edges = part.edges().filter_by(GeomType.LINE)
                    if edges:
                        b123_chamfer(edges, length=safe_ch)
            except Exception as e:
                logger.warning(f"Chamfer skipped: {e}")

    return part.part


def get_normalized_params(dims: Dict[str, Any], variant_type: str = "requested") -> Dict[str, Any]:
    length = float(dims["length"])
    width = float(dims["width"])
    height = float(dims["height"])
    if variant_type == "stronger":
        length *= 1.15
        width *= 1.15
        height *= 1.15
    return {
        "length_mm": length,
        "width_mm": width,
        "height_mm": height,
        "chamfer_mm": float(dims.get("chamfer", 0.0)),
        "variant_type": variant_type,
    }
