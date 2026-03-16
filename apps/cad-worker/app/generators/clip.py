"""
Cable Clip Generator — build123d
Generates a snap-fit cable clip for routing wires or tubing.

Required dimensions (mm):
  - cable_od: float        (outer diameter of cable/tube to clip)
  - wall_thickness: float  (clip wall thickness)
  - base_width: float      (width of the mounting base)

Optional:
  - base_length: float     (length of the mounting base, default = base_width)
  - base_thickness: float  (thickness of the mounting base, default 3.0mm)
  - hole_diameter: float   (mounting hole diameter, default 3.5mm for M3)
  - snap_gap: float        (opening gap for snap-fit, default cable_od * 0.3)
  - clearance: float       (extra clearance on cable OD, default 0.3mm)
  - hole_oversize: float   (FDM hole oversize, default 0.2mm)
"""

from typing import Any, Dict
import logging
import math

logger = logging.getLogger(__name__)

GENERATOR_NAME = "cable_clip"
GENERATOR_VERSION = "1.0.0"

MIN_WALL_THICKNESS_MM = 1.2
MIN_CABLE_OD_MM = 2.0
DEFAULT_HOLE_DIAMETER_MM = 3.5  # M3 clearance
DEFAULT_BASE_THICKNESS_MM = 3.0
DEFAULT_CLEARANCE_MM = 0.3
FDM_HOLE_OVERSIZE_MM = 0.2


def _cable_od(dims: Dict[str, Any]) -> Any:
    """Accept canonical 'cable_od' or alias 'cable_diameter'."""
    return dims.get("cable_od") if dims.get("cable_od") is not None else dims.get("cable_diameter")


def validate_params(dims: Dict[str, Any]) -> list:
    errors = []
    if _cable_od(dims) is None:
        errors.append("Missing required dimension: cable_od")
    for field in ["wall_thickness", "base_width"]:
        if dims.get(field) is None:
            errors.append(f"Missing required dimension: {field}")

    if dims.get("wall_thickness") and dims["wall_thickness"] < MIN_WALL_THICKNESS_MM:
        errors.append(
            f"wall_thickness {dims['wall_thickness']}mm below minimum {MIN_WALL_THICKNESS_MM}mm"
        )
    cod = _cable_od(dims)
    if cod is not None and cod < MIN_CABLE_OD_MM:
        errors.append(f"cable_od {cod}mm below minimum {MIN_CABLE_OD_MM}mm")

    return errors


def generate(dims: Dict[str, Any], variant_type: str = "requested") -> Any:
    """Generate a cable clip using build123d."""
    try:
        from build123d import (
            BuildPart, Box, Cylinder, fillet, Mode,
            Location, Locations, Axis
        )
    except ImportError as e:
        raise ImportError("build123d is not installed") from e

    errors = validate_params(dims)
    if errors:
        raise ValueError(f"Invalid cable clip dimensions: {'; '.join(errors)}")

    cable_od = _cable_od(dims)
    wall = dims["wall_thickness"]
    base_w = dims["base_width"]
    base_l = dims.get("base_length", base_w)
    base_t = dims.get("base_thickness", DEFAULT_BASE_THICKNESS_MM)
    hole_d = dims.get("hole_diameter", DEFAULT_HOLE_DIAMETER_MM)
    clearance = dims.get("clearance", DEFAULT_CLEARANCE_MM)
    hole_oversize = dims.get("hole_oversize", FDM_HOLE_OVERSIZE_MM)

    # Effective cable radius with clearance
    cable_r = (cable_od + clearance) / 2
    actual_hole_d = hole_d + hole_oversize

    # Snap gap: opening for inserting cable
    snap_gap = dims.get("snap_gap", cable_od * 0.3)

    # Variant modifications
    if variant_type == "stronger":
        wall = wall * 1.5
        base_t = base_t * 1.3
    elif variant_type == "print_optimized":
        # Slightly larger snap gap for easier printing
        snap_gap = snap_gap * 1.1

    # Clip outer radius
    clip_r = cable_r + wall
    clip_height = base_w  # Clip runs along the cable axis

    with BuildPart() as part:
        # Mounting base
        Box(base_l, base_w, base_t)

        # Clip arch: cylinder centered on top of base
        clip_center_z = base_t + clip_r
        with Locations(Location((0, 0, clip_center_z))):
            # Outer cylinder (clip body)
            Cylinder(
                radius=clip_r,
                height=clip_height,
                rotation=(90, 0, 0),
            )
            # Subtract inner channel for cable
            Cylinder(
                radius=cable_r,
                height=clip_height + 0.1,
                rotation=(90, 0, 0),
                mode=Mode.SUBTRACT,
            )

        # Subtract snap gap opening (slot at the top of the arch)
        gap_half = snap_gap / 2
        with Locations(Location((0, 0, clip_center_z + clip_r - snap_gap / 2))):
            Box(
                gap_half * 2,
                clip_height + 0.1,
                snap_gap + 0.1,
                mode=Mode.SUBTRACT,
            )

        # Mounting hole in base
        if actual_hole_d > 0:
            with Locations(Location((0, 0, 0))):
                Cylinder(
                    radius=actual_hole_d / 2,
                    height=base_t + 0.1,
                    mode=Mode.SUBTRACT,
                )

        # Fillet base edges
        try:
            base_edges = part.edges().filter_by(Axis.Z)
            if base_edges:
                fillet(base_edges[:4], radius=min(1.5, base_t * 0.3))
        except Exception as e:
            logger.warning(f"Base fillet skipped: {e}")

    return part.part


def get_normalized_params(dims: Dict[str, Any], variant_type: str = "requested") -> Dict[str, Any]:
    wall = dims["wall_thickness"]
    base_t = dims.get("base_thickness", DEFAULT_BASE_THICKNESS_MM)
    clearance = dims.get("clearance", DEFAULT_CLEARANCE_MM)

    if variant_type == "stronger":
        wall = wall * 1.5
        base_t = base_t * 1.3

    hole_d = dims.get("hole_diameter", DEFAULT_HOLE_DIAMETER_MM)
    hole_oversize = dims.get("hole_oversize", FDM_HOLE_OVERSIZE_MM)
    cable_od = _cable_od(dims)

    return {
        "cable_od_mm": cable_od,
        "wall_thickness_mm": wall,
        "base_width_mm": dims["base_width"],
        "base_length_mm": dims.get("base_length", dims["base_width"]),
        "base_thickness_mm": base_t,
        "clearance_mm": clearance,
        "snap_gap_mm": dims.get("snap_gap", cable_od * 0.3),
        "hole_diameter_mm": hole_d,
        "actual_hole_diameter_mm": hole_d + hole_oversize,
        "variant_type": variant_type,
    }
