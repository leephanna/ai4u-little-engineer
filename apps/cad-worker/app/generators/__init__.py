"""
Generator Registry
Maps part family names to their generator modules.
"""

from typing import Any, Dict

# Import all generator modules
from app.generators import spacer, l_bracket, u_bracket, hole_plate, clip, enclosure
from app.generators import flat_bracket, standoff_block, adapter_bushing, simple_jig
from app.generators import solid_block

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
    "flat_bracket": {
        "generate": flat_bracket.generate,
        "get_normalized_params": flat_bracket.get_normalized_params,
        "validate_params": flat_bracket.validate_params,
        "name": flat_bracket.GENERATOR_NAME,
        "version": flat_bracket.GENERATOR_VERSION,
    },
    "standoff_block": {
        "generate": standoff_block.generate,
        "get_normalized_params": standoff_block.get_normalized_params,
        "validate_params": standoff_block.validate_params,
        "name": standoff_block.GENERATOR_NAME,
        "version": standoff_block.GENERATOR_VERSION,
    },
    "adapter_bushing": {
        "generate": adapter_bushing.generate,
        "get_normalized_params": adapter_bushing.get_normalized_params,
        "validate_params": adapter_bushing.validate_params,
        "name": adapter_bushing.GENERATOR_NAME,
        "version": adapter_bushing.GENERATOR_VERSION,
    },
    "simple_jig": {
        "generate": simple_jig.generate,
        "get_normalized_params": simple_jig.get_normalized_params,
        "validate_params": simple_jig.validate_params,
        "name": simple_jig.GENERATOR_NAME,
        "version": simple_jig.GENERATOR_VERSION,
    },
    "solid_block": {
        "generate": solid_block.generate,
        "get_normalized_params": solid_block.get_normalized_params,
        "validate_params": solid_block.validate_params,
        "name": solid_block.GENERATOR_NAME,
        "version": solid_block.GENERATOR_VERSION,
    },
}

# Families defined in the schema/prompts but whose generators are not yet
# implemented. The API returns a 400 with this message rather than a 500.
PARTIAL_GENERATORS: Dict[str, str] = {}


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
