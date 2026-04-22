"""
Adapter Bushing Generator — build123d
Generates a stepped bushing that adapts between two different bore sizes.
Classic use case: adapt a 10mm shaft to a 6mm hole, or a 22mm bearing
to a 20mm bore.

Required dimensions (mm):
  - outer_diameter: float    (OD of the bushing body)
  - inner_diameter: float    (ID — the bore through the bushing)
  - height: float            (total height of the bushing)

Optional:
  - flange_diameter: float   (flange OD; omit for no flange)
  - flange_height: float     (flange thickness, default 2.0)
  - chamfer_bore: float      (chamfer on bore entry, default 0.3)
  - chamfer_top: float       (chamfer on OD top edge, default 0.5)
"""
from typing import Any, Dict
import logging

logger = logging.getLogger(__name__)

GENERATOR_NAME = "adapter_bushing"
GENERATOR_VERSION = "1.0.0"

MIN_OD_MM = 4.0
MIN_ID_MM = 1.0
MIN_HEIGHT_MM = 3.0
MIN_WALL_MM = 0.8


def validate_params(dims: Dict[str, Any]) -> list:
    errors = []
    od = dims.get("outer_diameter")
    id_ = dims.get("inner_diameter")
    # Accept 'length' as canonical alias for 'height' (capability registry uses 'length')
    height = dims.get("height") if dims.get("height") is not None else dims.get("length")
    flange_d = dims.get("flange_diameter")

    if od is None:
        errors.append("Missing required dimension: outer_diameter")
    if id_ is None:
        errors.append("Missing required dimension: inner_diameter")
    if height is None:
        errors.append("Missing required dimension: height (or length)")

    if od is not None and od < MIN_OD_MM:
        errors.append(f"outer_diameter {od}mm is below minimum {MIN_OD_MM}mm")
    if id_ is not None and id_ < MIN_ID_MM:
        errors.append(f"inner_diameter {id_}mm is below minimum {MIN_ID_MM}mm")
    if height is not None and height < MIN_HEIGHT_MM:
        errors.append(f"height {height}mm is below minimum {MIN_HEIGHT_MM}mm")

    if od is not None and id_ is not None:
        if id_ >= od:
            errors.append("inner_diameter must be less than outer_diameter")
        wall = (od - id_) / 2
        if wall < MIN_WALL_MM:
            errors.append(
                f"Wall thickness {wall:.2f}mm is below minimum {MIN_WALL_MM}mm"
            )

    if flange_d is not None and od is not None and flange_d <= od:
        errors.append("flange_diameter must be greater than outer_diameter")

    return errors


def generate(dims: Dict[str, Any], variant_type: str = "requested") -> Any:
    """Generate an adapter bushing using build123d. Returns a build123d Solid."""
    try:
        from build123d import (
            BuildPart, Cylinder, chamfer, Mode, Align, GeomType
        )
    except ImportError as e:
        raise ImportError("build123d is not installed") from e

    errors = validate_params(dims)
    if errors:
        raise ValueError(f"Invalid adapter_bushing dimensions: {'; '.join(errors)}")

    od = float(dims["outer_diameter"])
    id_ = float(dims["inner_diameter"])
    # Accept 'length' as canonical alias for 'height'
    height = float(dims["height"]) if dims.get("height") is not None else float(dims["length"])
    flange_d = dims.get("flange_diameter")
    flange_h = float(dims.get("flange_height", 2.0))
    chamfer_bore = float(dims.get("chamfer_bore", 0.3))
    chamfer_top = float(dims.get("chamfer_top", 0.5))

    if variant_type == "stronger":
        # Increase wall thickness by reducing ID slightly
        wall = (od - id_) / 2
        id_ = max(MIN_ID_MM, od - wall * 2 * 1.25)
        logger.info(f"Stronger variant: inner_diameter reduced to {id_:.2f}mm")

    with BuildPart() as part:
        # Main body
        Cylinder(
            radius=od / 2,
            height=height,
            align=(Align.CENTER, Align.CENTER, Align.MIN),
        )

        # Flange at base
        if flange_d:
            flange_d = float(flange_d)
            Cylinder(
                radius=flange_d / 2,
                height=flange_h,
                align=(Align.CENTER, Align.CENTER, Align.MIN),
            )

        # Bore through-hole
        Cylinder(
            radius=id_ / 2,
            height=height + (flange_h if flange_d else 0) + 0.1,
            align=(Align.CENTER, Align.CENTER, Align.MIN),
            mode=Mode.SUBTRACT,
        )

        # Chamfers
        max_ch = min(od / 8, height / 6, 1.5)
        if chamfer_top > 0:
            try:
                top_edges = part.edges().filter_by(GeomType.CIRCLE)
                if top_edges:
                    chamfer(top_edges[-1:], length=min(chamfer_top, max_ch))
            except Exception as e:
                logger.warning(f"Top chamfer skipped: {e}")

        if chamfer_bore > 0:
            try:
                bore_edges = part.edges().filter_by(GeomType.CIRCLE)
                if bore_edges:
                    chamfer(bore_edges[:1], length=min(chamfer_bore, id_ / 4))
            except Exception as e:
                logger.warning(f"Bore chamfer skipped: {e}")

    return part.part


def get_normalized_params(dims: Dict[str, Any], variant_type: str = "requested") -> Dict[str, Any]:
    od = float(dims["outer_diameter"])
    id_ = float(dims["inner_diameter"])
    if variant_type == "stronger":
        wall = (od - id_) / 2
        id_ = max(MIN_ID_MM, od - wall * 2 * 1.25)
    return {
        "outer_diameter_mm": od,
        "inner_diameter_mm": id_,
        "height_mm": float(dims["height"]) if dims.get("height") is not None else float(dims["length"]),
        "wall_thickness_mm": (od - id_) / 2,
        "has_flange": dims.get("flange_diameter") is not None,
        "flange_diameter_mm": dims.get("flange_diameter"),
        "variant_type": variant_type,
    }
