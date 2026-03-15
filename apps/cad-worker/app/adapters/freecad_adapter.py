"""
FreeCAD Adapter — STUB
Feature-flagged adapter for FreeCAD-based generation.

TODO: This is a stub implementation. Full FreeCAD integration requires:
  1. FreeCAD installed in the Docker image (complex dependency)
  2. FreeCAD Python bindings configured
  3. FreeCAD macro scripts for each part family

This adapter is DISABLED by default. Enable via ENABLE_FREECAD_ADAPTER=true env var.

PARTIAL — Not production-ready in V1.
"""

import os
import logging
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

FREECAD_ENABLED = os.getenv("ENABLE_FREECAD_ADAPTER", "false").lower() == "true"


def is_available() -> bool:
    """Check if FreeCAD adapter is enabled and FreeCAD is installed."""
    if not FREECAD_ENABLED:
        return False
    try:
        import FreeCAD  # noqa: F401
        return True
    except ImportError:
        return False


def generate_with_freecad(
    family: str,
    dims: Dict[str, float],
    variant_type: str = "requested",
    output_dir: str = "/tmp/cad_artifacts",
) -> Dict[str, Any]:
    """
    Generate a part using FreeCAD.

    TODO: Implement FreeCAD macro execution for each supported family.
    Currently raises NotImplementedError.
    """
    if not FREECAD_ENABLED:
        raise RuntimeError(
            "FreeCAD adapter is disabled. Set ENABLE_FREECAD_ADAPTER=true to enable."
        )

    if not is_available():
        raise RuntimeError(
            "FreeCAD is not installed or not importable. "
            "See apps/cad-worker/docs/freecad-setup.md for installation instructions."
        )

    # TODO: Implement FreeCAD generation
    raise NotImplementedError(
        f"FreeCAD adapter for family '{family}' is not yet implemented. "
        "This is a PARTIAL stub. Use build123d engine instead."
    )
