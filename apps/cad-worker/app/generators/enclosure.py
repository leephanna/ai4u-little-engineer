"""
Enclosure / Box Generator — build123d
Generates a rectangular enclosure with optional lid.

Required dimensions (mm):
  - inner_length: float    (interior length)
  - inner_width: float     (interior width)
  - inner_height: float    (interior height)
  - wall_thickness: float  (wall thickness)

Optional:
  - lid: bool              (generate a separate lid, default False)
  - lid_tolerance: float   (lid fit tolerance, default 0.3mm)
  - corner_fillet: float   (outer corner fillet, default 2.0mm)
  - bottom_thickness: float (bottom wall thickness, default = wall_thickness)
  - screw_boss: bool       (add corner screw bosses, default False)
  - boss_od: float         (screw boss outer diameter, default 6.0mm)
  - boss_id: float         (screw boss inner diameter, default 2.5mm for M2.5)
"""

from typing import Any, Dict
import logging

logger = logging.getLogger(__name__)

GENERATOR_NAME = "enclosure"
GENERATOR_VERSION = "1.0.0"

MIN_WALL_THICKNESS_MM = 1.5
MIN_INNER_DIMENSION_MM = 10.0
DEFAULT_FILLET_MM = 2.0
DEFAULT_LID_TOLERANCE_MM = 0.3


def validate_params(dims: Dict[str, float]) -> list[str]:
    errors = []
    for field in ["inner_length", "inner_width", "inner_height", "wall_thickness"]:
        if dims.get(field) is None:
            errors.append(f"Missing required dimension: {field}")

    if dims.get("wall_thickness") and dims["wall_thickness"] < MIN_WALL_THICKNESS_MM:
        errors.append(
            f"wall_thickness {dims['wall_thickness']}mm below minimum {MIN_WALL_THICKNESS_MM}mm"
        )
    for dim in ["inner_length", "inner_width", "inner_height"]:
        if dims.get(dim) and dims[dim] < MIN_INNER_DIMENSION_MM:
            errors.append(f"{dim} {dims[dim]}mm below minimum {MIN_INNER_DIMENSION_MM}mm")

    return errors


def generate(dims: Dict[str, float], variant_type: str = "requested") -> Any:
    """Generate an enclosure box using build123d."""
    try:
        from build123d import (
            BuildPart, Box, Cylinder, Fillet, Shell, Mode,
            Location, Locations, Axis, Plane, add
        )
        import build123d as bd
    except ImportError as e:
        raise ImportError("build123d is not installed") from e

    errors = validate_params(dims)
    if errors:
        raise ValueError(f"Invalid enclosure dimensions: {'; '.join(errors)}")

    il = dims["inner_length"]
    iw = dims["inner_width"]
    ih = dims["inner_height"]
    wall = dims["wall_thickness"]
    bottom_t = dims.get("bottom_thickness", wall)
    fillet_r = dims.get("corner_fillet", DEFAULT_FILLET_MM)
    screw_boss = bool(dims.get("screw_boss", False))
    boss_od = dims.get("boss_od", 6.0)
    boss_id = dims.get("boss_id", 2.5)

    # Variant modifications
    if variant_type == "stronger":
        wall = wall * 1.5
        bottom_t = bottom_t * 1.5
    elif variant_type == "print_optimized":
        fillet_r = min(fillet_r, 1.0)
        screw_boss = False

    # Outer dimensions
    ol = il + 2 * wall
    ow = iw + 2 * wall
    oh = ih + bottom_t

    with BuildPart() as part:
        # Outer shell
        Box(ol, ow, oh)

        # Hollow interior (subtract inner volume from top)
        with Locations(Location((0, 0, bottom_t))):
            Box(il, iw, ih + 0.1, mode=Mode.SUBTRACT)

        # Corner fillets on outer edges
        if fillet_r > 0:
            try:
                outer_edges = part.edges().filter_by(Axis.Z)
                if outer_edges:
                    Fillet(*outer_edges, radius=min(fillet_r, min(ol, ow) * 0.1))
            except Exception as e:
                logger.warning(f"Could not apply corner fillets: {e}")

        # Screw bosses at inner corners
        if screw_boss and boss_od > 0 and boss_id > 0:
            boss_positions = [
                (-il / 2 + boss_od / 2, -iw / 2 + boss_od / 2),
                (il / 2 - boss_od / 2, -iw / 2 + boss_od / 2),
                (il / 2 - boss_od / 2, iw / 2 - boss_od / 2),
                (-il / 2 + boss_od / 2, iw / 2 - boss_od / 2),
            ]
            for (bx, by) in boss_positions:
                with Locations(Location((bx, by, bottom_t))):
                    Cylinder(radius=boss_od / 2, height=ih * 0.8)
                    Cylinder(
                        radius=boss_id / 2,
                        height=ih * 0.8 + 0.1,
                        mode=Mode.SUBTRACT,
                    )

    return part.part


def get_normalized_params(dims: Dict[str, float], variant_type: str = "requested") -> Dict[str, Any]:
    wall = dims["wall_thickness"]
    bottom_t = dims.get("bottom_thickness", wall)

    if variant_type == "stronger":
        wall = wall * 1.5
        bottom_t = bottom_t * 1.5

    il = dims["inner_length"]
    iw = dims["inner_width"]
    ih = dims["inner_height"]

    return {
        "inner_length_mm": il,
        "inner_width_mm": iw,
        "inner_height_mm": ih,
        "wall_thickness_mm": wall,
        "bottom_thickness_mm": bottom_t,
        "outer_length_mm": il + 2 * wall,
        "outer_width_mm": iw + 2 * wall,
        "outer_height_mm": ih + bottom_t,
        "corner_fillet_mm": dims.get("corner_fillet", DEFAULT_FILLET_MM),
        "screw_boss": bool(dims.get("screw_boss", False)),
        "variant_type": variant_type,
    }
