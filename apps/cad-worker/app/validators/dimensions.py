"""
Dimension Validators
Validates that generated geometry meets specified dimensional requirements.
"""

from typing import Any, List, Optional, Tuple
import logging

logger = logging.getLogger(__name__)


def validate_bounding_box(
    part: Any,
    max_dimensions_mm: Optional[List[float]] = None,
) -> Tuple[bool, Optional[List[float]], List[str]]:
    """
    Validate that the part fits within the specified bounding box.

    Returns: (ok, [x, y, z] bounding box, warnings)
    """
    warnings = []
    bbox = None

    try:
        bb = part.bounding_box()
        bbox = [
            round(bb.size.X, 3),
            round(bb.size.Y, 3),
            round(bb.size.Z, 3),
        ]

        if max_dimensions_mm:
            for i, (actual, max_d) in enumerate(zip(bbox, max_dimensions_mm)):
                axis = ["X", "Y", "Z"][i]
                if actual > max_d:
                    warnings.append(
                        f"Part {axis} dimension {actual:.1f}mm exceeds max {max_d:.1f}mm"
                    )
            return len(warnings) == 0, bbox, warnings

        return True, bbox, warnings

    except Exception as e:
        logger.error(f"Bounding box validation failed: {e}")
        return False, None, [f"Could not compute bounding box: {e}"]


def validate_volume(part: Any) -> Tuple[bool, Optional[float], List[str]]:
    """Validate that the part has non-zero volume."""
    warnings = []
    try:
        vol = part.volume
        if vol <= 0:
            return False, vol, ["Part has zero or negative volume — geometry may be invalid"]
        return True, round(vol, 3), warnings
    except Exception as e:
        return False, None, [f"Could not compute volume: {e}"]
