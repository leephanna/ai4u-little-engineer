"""
STL Exporter
Exports a build123d part to STL format (binary or ASCII).
"""

import os
import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)


def export_stl(
    part: Any,
    output_path: str,
    tolerance: float = 0.001,
    angular_tolerance: float = 0.1,
    binary: bool = True,
) -> str:
    """
    Export a build123d part to STL format.

    Args:
        part: build123d Solid or Compound
        output_path: Full path for the output .stl file
        tolerance: Linear deflection tolerance in mm (default 0.001mm)
        angular_tolerance: Angular deflection tolerance in radians (default 0.1)
        binary: Export as binary STL (default True, smaller file size)

    Returns:
        output_path on success

    Raises:
        RuntimeError if export fails
        ImportError if build123d is not available
    """
    try:
        from build123d import export_stl as bd_export_stl
    except ImportError as e:
        raise ImportError("build123d is not installed") from e

    output_path = str(output_path)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    try:
        bd_export_stl(
            part,
            output_path,
            tolerance=tolerance,
            angular_tolerance=angular_tolerance,
            binary=binary,
        )
        logger.info(f"STL exported to {output_path} ({os.path.getsize(output_path)} bytes)")
        return output_path
    except Exception as e:
        raise RuntimeError(f"STL export failed: {e}") from e
