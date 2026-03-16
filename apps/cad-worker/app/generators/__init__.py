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
        "validate_params": spacer.validate_params,
        "name": spacer.GENERATOR_NAME,
        "version": spacer.GENERATOR_VERSION,
    },
    "l_bracket": {
        "generate": l_bracket.generate,
        "get_normalized_params": l_bracket.get_normalized_params,
        "validate_params": l_bracket.validate_params,
        "name": l_bracket.GENERATOR_NAME,
        "version": l_bracket.GENERATOR_VERSION,
    },
    "u_bracket": {
        "generate": u_bracket.generate,
        "get_normalized_params": u_bracket.get_normalized_params,
        "validate_params": u_bracket.validate_params,
        "name": u_bracket.GENERATOR_NAME,
        "version": u_bracket.GENERATOR_VERSION,
    },
    "hole_plate": {
        "generate": hole_plate.generate,
        "get_normalized_params": hole_plate.get_normalized_params,
        "validate_params": hole_plate.validate_params,
        "name": hole_plate.GENERATOR_NAME,
        "version": hole_plate.GENERATOR_VERSION,
    },
    "cable_clip": {
        "generate": clip.generate,
        "get_normalized_params": clip.get_normalized_params,
        "validate_params": clip.validate_params,
        "name": clip.GENERATOR_NAME,
        "version": clip.GENERATOR_VERSION,
    },
    "enclosure": {
        "generate": enclosure.generate,
        "get_normalized_params": enclosure.get_normalized_params,
        "validate_params": enclosure.validate_params,
        "name": enclosure.GENERATOR_NAME,
        "version": enclosure.GENERATOR_VERSION,
    },
}

# Families defined in the schema/prompts but whose generators are not yet
# implemented in V1. The API returns a 400 with this message rather than a 500.
PARTIAL_GENERATORS = {
    "flat_bracket":    "Generator not yet implemented in V1. Use hole_plate for a similar result.",
    "standoff_block":  "Generator not yet implemented in V1. Use spacer for a similar result.",
    "adapter_bushing": "Generator not yet implemented in V1. Use spacer for a similar result.",
    "simple_jig":      "Generator not yet implemented in V1.",
}


def get_generator(family: str) -> Dict[str, Any]:
    """
    Get the generator for a given part family.
    Raises KeyError if the family is not in the MVP registry.
    Callers should check is_supported() first.
    """
    if family not in GENERATOR_REGISTRY:
        raise KeyError(
            f"No generator registered for family '{family}'. "
            f"Supported: {', '.join(GENERATOR_REGISTRY.keys())}"
        )
    return GENERATOR_REGISTRY[family]


def is_supported(family: str) -> bool:
    """Check if a family has a full generator implementation."""
    return family in GENERATOR_REGISTRY


def list_supported_families() -> list[str]:
    """List all fully supported part families."""
    return list(GENERATOR_REGISTRY.keys())


def list_partial_families() -> Dict[str, str]:
    """List families with partial/stub implementations."""
    return PARTIAL_GENERATORS.copy()
