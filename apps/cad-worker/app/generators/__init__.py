"""
Generator Registry
Maps part family names to their generator modules.
"""

from typing import Any, Callable, Dict, Optional, Tuple

# Import all generator modules
from app.generators import spacer, l_bracket, u_bracket, hole_plate, clip, enclosure

# Registry: family_name -> (generate_fn, get_normalized_params_fn, name, version)
GENERATOR_REGISTRY: Dict[str, Dict[str, Any]] = {
    "spacer": {
        "generate": spacer.generate,
        "get_normalized_params": spacer.get_normalized_params,
        "name": spacer.GENERATOR_NAME,
        "version": spacer.GENERATOR_VERSION,
    },
    "l_bracket": {
        "generate": l_bracket.generate,
        "get_normalized_params": l_bracket.get_normalized_params,
        "name": l_bracket.GENERATOR_NAME,
        "version": l_bracket.GENERATOR_VERSION,
    },
    "u_bracket": {
        "generate": u_bracket.generate,
        "get_normalized_params": u_bracket.get_normalized_params,
        "name": u_bracket.GENERATOR_NAME,
        "version": u_bracket.GENERATOR_VERSION,
    },
    "hole_plate": {
        "generate": hole_plate.generate,
        "get_normalized_params": hole_plate.get_normalized_params,
        "name": hole_plate.GENERATOR_NAME,
        "version": hole_plate.GENERATOR_VERSION,
    },
    "cable_clip": {
        "generate": clip.generate,
        "get_normalized_params": clip.get_normalized_params,
        "name": clip.GENERATOR_NAME,
        "version": clip.GENERATOR_VERSION,
    },
    "enclosure": {
        "generate": enclosure.generate,
        "get_normalized_params": enclosure.get_normalized_params,
        "name": enclosure.GENERATOR_NAME,
        "version": enclosure.GENERATOR_VERSION,
    },
}

# Families with PARTIAL implementations (stub only)
# TODO: Implement these generators before enabling in production
PARTIAL_GENERATORS = {
    "flat_bracket": "TODO: Implement flat_bracket generator (similar to hole_plate but without hole pattern)",
    "standoff_block": "TODO: Implement standoff_block generator",
    "adapter_bushing": "TODO: Implement adapter_bushing generator (similar to spacer with stepped bore)",
    "simple_jig": "TODO: Implement simple_jig generator",
}


def get_generator(family: str) -> Optional[Dict[str, Any]]:
    """Get the generator for a given part family. Returns None if not found."""
    return GENERATOR_REGISTRY.get(family)


def is_supported(family: str) -> bool:
    """Check if a family has a full generator implementation."""
    return family in GENERATOR_REGISTRY


def list_supported_families() -> list[str]:
    """List all fully supported part families."""
    return list(GENERATOR_REGISTRY.keys())


def list_partial_families() -> Dict[str, str]:
    """List families with partial/stub implementations."""
    return PARTIAL_GENERATORS.copy()
