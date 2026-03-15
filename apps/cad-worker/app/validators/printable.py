"""
Printability Validator
Scores and validates a part for FDM 3D printability.
"""

from typing import Any, Dict, List, Optional, Tuple
import logging

logger = logging.getLogger(__name__)

# FDM printability thresholds
MIN_WALL_THICKNESS_MM = 1.2
IDEAL_WALL_THICKNESS_MM = 2.0
MAX_OVERHANG_ANGLE_DEG = 45.0
STANDARD_NOZZLE_MM = 0.4


def score_printability(
    part: Any,
    wall_thickness_mm: Optional[float] = None,
    nozzle_size_mm: float = STANDARD_NOZZLE_MM,
    bounding_box: Optional[List[float]] = None,
) -> Tuple[float, List[str], List[str]]:
    """
    Compute a printability score (0.0–1.0) for the part.

    Returns: (score, warnings, errors)
    """
    score = 1.0
    warnings = []
    errors = []

    # Wall thickness check
    if wall_thickness_mm is not None:
        if wall_thickness_mm < MIN_WALL_THICKNESS_MM:
            errors.append(
                f"Wall thickness {wall_thickness_mm:.2f}mm is below minimum "
                f"{MIN_WALL_THICKNESS_MM}mm for FDM printing"
            )
            score -= 0.4
        elif wall_thickness_mm < IDEAL_WALL_THICKNESS_MM:
            warnings.append(
                f"Wall thickness {wall_thickness_mm:.2f}mm is thin. "
                f"Recommend >= {IDEAL_WALL_THICKNESS_MM}mm for strength."
            )
            score -= 0.1

        # Check nozzle compatibility
        if wall_thickness_mm < nozzle_size_mm * 2:
            warnings.append(
                f"Wall thickness {wall_thickness_mm:.2f}mm may be too thin for "
                f"{nozzle_size_mm}mm nozzle (recommend >= {nozzle_size_mm * 2:.1f}mm)"
            )
            score -= 0.05

    # Bounding box check (common printer volumes)
    if bounding_box:
        max_dim = max(bounding_box)
        if max_dim > 300:
            warnings.append(
                f"Part dimension {max_dim:.0f}mm exceeds typical FDM printer volume (300mm). "
                "Verify printer capacity."
            )
            score -= 0.1
        elif max_dim > 200:
            warnings.append(
                f"Part dimension {max_dim:.0f}mm is large. Verify printer bed size."
            )
            score -= 0.05

    # Basic geometry check
    try:
        if part is not None:
            # Check for valid solid
            if hasattr(part, 'is_valid') and not part.is_valid:
                errors.append("Part geometry is invalid (non-manifold or degenerate)")
                score -= 0.5
    except Exception as e:
        logger.warning(f"Could not validate geometry: {e}")

    score = max(0.0, min(1.0, score))
    return round(score, 3), warnings, errors


def check_wall_thickness(
    dims: Dict[str, float],
    family: str,
) -> Tuple[bool, Optional[float], List[str]]:
    """
    Extract and validate wall thickness from dimensions.
    Returns: (ok, thickness_mm, warnings)
    """
    warnings = []

    # Map family to wall thickness dimension key
    wall_key_map = {
        "spacer": None,  # Wall = (OD - ID) / 2
        "l_bracket": "thickness",
        "u_bracket": "wall_thickness",
        "hole_plate": "thickness",
        "cable_clip": "wall_thickness",
        "enclosure": "wall_thickness",
        "flat_bracket": "thickness",
        "standoff_block": None,
        "adapter_bushing": None,
        "simple_jig": None,
    }

    wall_key = wall_key_map.get(family)
    wall_mm = None

    if wall_key and wall_key in dims:
        wall_mm = dims[wall_key]
    elif family == "spacer":
        od = dims.get("outer_diameter")
        id_ = dims.get("inner_diameter", 0)
        if od and id_ > 0:
            wall_mm = (od - id_) / 2

    if wall_mm is not None and wall_mm < MIN_WALL_THICKNESS_MM:
        warnings.append(
            f"Wall thickness {wall_mm:.2f}mm is below FDM minimum {MIN_WALL_THICKNESS_MM}mm"
        )
        return False, wall_mm, warnings

    return True, wall_mm, warnings
