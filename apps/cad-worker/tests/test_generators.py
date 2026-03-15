"""
CAD Worker Generator Tests
Tests for dimension validation and parameter normalization.
Note: Full geometry generation tests require build123d to be installed.
"""

import pytest
from app.generators.spacer import validate_params as spacer_validate, get_normalized_params as spacer_params
from app.generators.l_bracket import validate_params as lbracket_validate, get_normalized_params as lbracket_params
from app.generators.u_bracket import validate_params as ubracket_validate, get_normalized_params as ubracket_params
from app.generators.hole_plate import validate_params as holeplate_validate, get_normalized_params as holeplate_params
from app.generators.clip import validate_params as clip_validate, get_normalized_params as clip_params
from app.schemas.part_spec import PartSpec


# ─────────────────────────────────────────────────────────────
# Spacer tests
# ─────────────────────────────────────────────────────────────

class TestSpacerValidator:
    def test_valid_hollow_spacer(self):
        dims = {"outer_diameter": 20.0, "inner_diameter": 10.0, "length": 15.0}
        errors = spacer_validate(dims)
        assert errors == []

    def test_valid_solid_spacer(self):
        dims = {"outer_diameter": 10.0, "inner_diameter": 0.0, "length": 5.0}
        errors = spacer_validate(dims)
        assert errors == []

    def test_missing_outer_diameter(self):
        dims = {"inner_diameter": 5.0, "length": 10.0}
        errors = spacer_validate(dims)
        assert any("outer_diameter" in e for e in errors)

    def test_missing_length(self):
        dims = {"outer_diameter": 10.0}
        errors = spacer_validate(dims)
        assert any("length" in e for e in errors)

    def test_wall_too_thin(self):
        dims = {"outer_diameter": 10.0, "inner_diameter": 9.0, "length": 10.0}
        errors = spacer_validate(dims)
        assert any("Wall thickness" in e for e in errors)

    def test_id_exceeds_od(self):
        dims = {"outer_diameter": 10.0, "inner_diameter": 12.0, "length": 10.0}
        errors = spacer_validate(dims)
        assert any("inner_diameter" in e for e in errors)


class TestSpacerNormalizedParams:
    def test_requested_variant(self):
        dims = {"outer_diameter": 20.0, "inner_diameter": 10.0, "length": 15.0}
        params = spacer_params(dims, "requested")
        assert params["outer_diameter_mm"] == 20.0
        assert params["inner_diameter_mm"] == 10.0
        assert params["wall_thickness_mm"] == 5.0
        assert params["is_hollow"] is True

    def test_stronger_variant_increases_wall(self):
        dims = {"outer_diameter": 20.0, "inner_diameter": 10.0, "length": 15.0}
        params = spacer_params(dims, "stronger")
        assert params["wall_thickness_mm"] > 5.0


# ─────────────────────────────────────────────────────────────
# L-Bracket tests
# ─────────────────────────────────────────────────────────────

class TestLBracketValidator:
    def test_valid_l_bracket(self):
        dims = {"leg_a": 50.0, "leg_b": 40.0, "thickness": 4.0, "width": 30.0}
        errors = lbracket_validate(dims)
        assert errors == []

    def test_missing_required_fields(self):
        dims = {"leg_a": 50.0}
        errors = lbracket_validate(dims)
        assert len(errors) >= 3  # leg_b, thickness, width

    def test_thickness_too_thin(self):
        dims = {"leg_a": 50.0, "leg_b": 40.0, "thickness": 1.0, "width": 30.0}
        errors = lbracket_validate(dims)
        assert any("thickness" in e for e in errors)


class TestLBracketNormalizedParams:
    def test_requested_variant(self):
        dims = {"leg_a": 50.0, "leg_b": 40.0, "thickness": 4.0, "width": 30.0}
        params = lbracket_params(dims, "requested")
        assert params["leg_a_mm"] == 50.0
        assert params["thickness_mm"] == 4.0

    def test_stronger_variant_increases_thickness(self):
        dims = {"leg_a": 50.0, "leg_b": 40.0, "thickness": 4.0, "width": 30.0}
        params = lbracket_params(dims, "stronger")
        assert params["thickness_mm"] == 6.0  # 4.0 * 1.5

    def test_hole_oversize_applied(self):
        dims = {"leg_a": 50.0, "leg_b": 40.0, "thickness": 4.0, "width": 30.0, "hole_diameter": 5.0}
        params = lbracket_params(dims, "requested")
        assert params["actual_hole_diameter_mm"] == 5.2  # 5.0 + 0.2 oversize


# ─────────────────────────────────────────────────────────────
# U-Bracket tests
# ─────────────────────────────────────────────────────────────

class TestUBracketValidator:
    def test_valid_u_bracket(self):
        dims = {
            "pipe_od": 50.8, "wall_thickness": 4.0,
            "flange_width": 30.0, "flange_length": 60.0
        }
        errors = ubracket_validate(dims)
        assert errors == []

    def test_missing_pipe_od(self):
        dims = {"wall_thickness": 4.0, "flange_width": 30.0, "flange_length": 60.0}
        errors = ubracket_validate(dims)
        assert any("pipe_od" in e for e in errors)


# ─────────────────────────────────────────────────────────────
# PartSpec unit normalization tests
# ─────────────────────────────────────────────────────────────

class TestPartSpecNormalization:
    def test_inches_to_mm_conversion(self):
        spec = PartSpec(
            family="spacer",
            units="in",
            dimensions={"outer_diameter": 1.0, "inner_diameter": 0.5, "length": 0.75},
        )
        normalized = spec.normalize_to_mm()
        assert normalized.units == "mm"
        assert abs(normalized.dimensions["outer_diameter"] - 25.4) < 0.001
        assert abs(normalized.dimensions["inner_diameter"] - 12.7) < 0.001
        assert abs(normalized.dimensions["length"] - 19.05) < 0.001

    def test_mm_unchanged(self):
        spec = PartSpec(
            family="spacer",
            units="mm",
            dimensions={"outer_diameter": 20.0, "inner_diameter": 10.0, "length": 15.0},
        )
        normalized = spec.normalize_to_mm()
        assert normalized.dimensions["outer_diameter"] == 20.0

    def test_invalid_family_raises(self):
        with pytest.raises(ValueError):
            PartSpec(family="invalid_family", dimensions={})


# ─────────────────────────────────────────────────────────────
# Generator registry tests
# ─────────────────────────────────────────────────────────────

class TestGeneratorRegistry:
    def test_supported_families(self):
        from app.generators import list_supported_families, is_supported
        families = list_supported_families()
        assert "spacer" in families
        assert "l_bracket" in families
        assert "u_bracket" in families
        assert "hole_plate" in families
        assert "cable_clip" in families
        assert "enclosure" in families

    def test_unsupported_family(self):
        from app.generators import is_supported
        assert not is_supported("sculpture")
        assert not is_supported("freeform_organic")

    def test_partial_families_documented(self):
        from app.generators import list_partial_families
        partials = list_partial_families()
        assert "flat_bracket" in partials
        assert "standoff_block" in partials
