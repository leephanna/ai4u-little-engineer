"""
STEP Exporter
Exports a build123d part to STEP format.
"""

import os
import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)


def export_step(
    part: Any,
    output_path: str,
    metadata: Optional[dict] = None,
) -> str:
    """
    Export a build123d part to STEP format.

    Args:
        part: build123d Solid or Compound
        output_path: Full path for the output .step file
        metadata: Optional metadata to embed (author, description, etc.)

    Returns:
        output_path on success

    Raises:
        RuntimeError if export fails
        ImportError if build123d is not available
    """
    try:
        from build123d import export_step as bd_export_step
    except ImportError as e:
        raise ImportError("build123d is not installed") from e

    output_path = str(output_path)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    try:
        bd_export_step(part, output_path)
        logger.info(f"STEP exported to {output_path} ({os.path.getsize(output_path)} bytes)")
        return output_path
    except Exception as e:
        raise RuntimeError(f"STEP export failed: {e}") from e
