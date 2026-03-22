"""
Tests for the 4 new CAD generators:
  - flat_bracket
  - standoff_block
  - adapter_bushing
  - simple_jig

These tests cover:
  - Parameter validation (valid and invalid inputs)
  - Normalized params (including variant_type mutations)
  - Registry registration
  - Schema integration (printer_profile field)
"""

import pytest

# ─────────────────────────────────────────────────────────────
# Import helpers
# ─────────────────────────────────────────────────────────────
from app.generators.flat_bracket import (
    validate_params as fb_validate,
    get_normalized_params as fb_params,
    GENERATOR_NAME as FB_NAME,
)
from app.generators.standoff_block import (
    validate_params as sb_validate,
    get_normalized_params as sb_params,
    GENERATOR_NAME as SB_NAME,
)
from app.generators.adapter_bushing import (
    validate_params as ab_validate,
    get_normalized_params as ab_params,
    GENERATOR_NAME as AB_NAME,
)
from app.generators.simple_jig import (
    validate_params as jig_validate,
    get_normalized_params as jig_params,
    GENERATOR_NAME as JIG_NAME,
)


# ─────────────────────────────────────────────────────────────
# flat_bracket tests
# ─────────────────────────────────────────────────────────────
class TestFlatBracketValidator:
    def test_valid_params(self):
        dims = {"length": 80.0, "width": 30.0, "thickness": 3.0}
        assert fb_validate(dims) == []

    def test_missing_required(self):
        errors = fb_validate({"length": 80.0})
        assert any("width" in e for e in errors)
        assert any("thickness" in e for e in errors)

    def test_length_too_short(self):
        dims = {"length": 10.0, "width": 30.0, "thickness": 3.0}
        errors = fb_validate(dims)
        assert any("length" in e for e in errors)

    def test_width_too_narrow(self):
        dims = {"length": 80.0, "width": 5.0, "thickness": 3.0}
        errors = fb_validate(dims)
        assert any("width" in e for e in errors)

    def test_thickness_too_thin(self):
        dims = {"length": 80.0, "width": 30.0, "thickness": 0.5}
        errors = fb_validate(dims)
        assert any("thickness" in e for e in errors)

    def test_hole_margin_too_large(self):
        dims = {"length": 30.0, "width": 20.0, "thickness": 3.0, "hole_margin_mm": 20.0}
        errors = fb_validate(dims)
        assert any("hole_margin" in e for e in errors)

    def test_hole_diameter_too_small(self):
        dims = {"length": 80.0, "width": 30.0, "thickness": 3.0, "hole_diameter": 0.5}
        errors = fb_validate(dims)
        assert any("hole_diameter" in e for e in errors)


class TestFlatBracketNormalizedParams:
    def test_requested_variant(self):
        dims = {"length": 80.0, "width": 30.0, "thickness": 3.0}
        params = fb_params(dims, "requested")
        assert params["length_mm"] == 80.0
        assert params["width_mm"] == 30.0
        assert params["thickness_mm"] == 3.0
        assert params["hole_diameter_mm"] == 4.0  # default
        assert params["hole_count"] == 2           # default
        assert params["variant_type"] == "requested"

    def test_stronger_variant_increases_thickness(self):
        dims = {"length": 80.0, "width": 30.0, "thickness": 4.0}
        params = fb_params(dims, "stronger")
        assert params["thickness_mm"] == pytest.approx(5.0, rel=0.01)

    def test_custom_holes(self):
        dims = {
            "length": 120.0, "width": 40.0, "thickness": 3.0,
            "hole_diameter": 5.0, "hole_count": 4, "hole_margin_mm": 12.0
        }
        params = fb_params(dims, "requested")
        assert params["hole_count"] == 4
        assert params["hole_diameter_mm"] == 5.0
        assert params["hole_margin_mm"] == 12.0


# ─────────────────────────────────────────────────────────────
# standoff_block tests
# ─────────────────────────────────────────────────────────────
class TestStandoffBlockValidator:
    def test_valid_params(self):
        dims = {"height": 10.0, "base_width": 8.0}
        assert sb_validate(dims) == []

    def test_missing_required(self):
        errors = sb_validate({"height": 10.0})
        assert any("base_width" in e for e in errors)

    def test_height_too_short(self):
        dims = {"height": 1.0, "base_width": 8.0}
        errors = sb_validate(dims)
        assert any("height" in e for e in errors)

    def test_base_too_small(self):
        dims = {"height": 10.0, "base_width": 2.0}
        errors = sb_validate(dims)
        assert any("base_width" in e for e in errors)

    def test_hole_too_large_for_base(self):
        dims = {"height": 10.0, "base_width": 6.0, "hole_diameter": 5.5}
        errors = sb_validate(dims)
        assert any("hole_diameter" in e or "too large" in e for e in errors)


class TestStandoffBlockNormalizedParams:
    def test_requested_variant(self):
        dims = {"height": 10.0, "base_width": 8.0}
        params = sb_params(dims, "requested")
        assert params["height_mm"] == 10.0
        assert params["base_width_mm"] == 8.0
        assert params["hole_diameter_mm"] == 3.0  # default M3
        assert params["shape"] == "square"

    def test_stronger_variant_increases_base(self):
        dims = {"height": 10.0, "base_width": 8.0}
        params = sb_params(dims, "stronger")
        assert params["base_width_mm"] > 8.0

    def test_hex_shape(self):
        dims = {"height": 10.0, "base_width": 10.0, "shape": "hex"}
        params = sb_params(dims, "requested")
        assert params["shape"] == "hex"


# ─────────────────────────────────────────────────────────────
# adapter_bushing tests
# ─────────────────────────────────────────────────────────────
class TestAdapterBushingValidator:
    def test_valid_params(self):
        dims = {"outer_diameter": 22.0, "inner_diameter": 10.0, "height": 15.0}
        assert ab_validate(dims) == []

    def test_missing_required(self):
        errors = ab_validate({"outer_diameter": 22.0})
        assert any("inner_diameter" in e for e in errors)
        assert any("height" in e for e in errors)

    def test_id_greater_than_od(self):
        dims = {"outer_diameter": 10.0, "inner_diameter": 12.0, "height": 15.0}
        errors = ab_validate(dims)
        assert any("inner_diameter" in e for e in errors)

    def test_wall_too_thin(self):
        dims = {"outer_diameter": 10.0, "inner_diameter": 9.5, "height": 15.0}
        errors = ab_validate(dims)
        assert any("wall" in e.lower() for e in errors)

    def test_flange_smaller_than_od(self):
        dims = {
            "outer_diameter": 22.0, "inner_diameter": 10.0, "height": 15.0,
            "flange_diameter": 20.0  # smaller than OD
        }
        errors = ab_validate(dims)
        assert any("flange" in e for e in errors)

    def test_od_too_small(self):
        dims = {"outer_diameter": 2.0, "inner_diameter": 1.0, "height": 15.0}
        errors = ab_validate(dims)
        assert any("outer_diameter" in e for e in errors)


class TestAdapterBushingNormalizedParams:
    def test_requested_variant(self):
        dims = {"outer_diameter": 22.0, "inner_diameter": 10.0, "height": 15.0}
        params = ab_params(dims, "requested")
        assert params["outer_diameter_mm"] == 22.0
        assert params["inner_diameter_mm"] == 10.0
        assert params["wall_thickness_mm"] == pytest.approx(6.0)
        assert params["has_flange"] is False

    def test_stronger_variant_reduces_id(self):
        dims = {"outer_diameter": 22.0, "inner_diameter": 10.0, "height": 15.0}
        params = ab_params(dims, "stronger")
        assert params["inner_diameter_mm"] < 10.0  # ID reduced to increase wall

    def test_with_flange(self):
        dims = {
            "outer_diameter": 22.0, "inner_diameter": 10.0, "height": 15.0,
            "flange_diameter": 30.0
        }
        params = ab_params(dims, "requested")
        assert params["has_flange"] is True
        assert params["flange_diameter_mm"] == 30.0


# ─────────────────────────────────────────────────────────────
# simple_jig tests
# ─────────────────────────────────────────────────────────────
class TestSimpleJigValidator:
    def test_valid_params(self):
        dims = {"length": 100.0, "width": 60.0, "thickness": 5.0}
        assert jig_validate(dims) == []

    def test_missing_required(self):
        errors = jig_validate({"length": 100.0, "width": 60.0})
        assert any("thickness" in e for e in errors)

    def test_length_too_short(self):
        dims = {"length": 15.0, "width": 60.0, "thickness": 5.0}
        errors = jig_validate(dims)
        assert any("length" in e for e in errors)

    def test_width_too_narrow(self):
        dims = {"length": 100.0, "width": 10.0, "thickness": 5.0}
        errors = jig_validate(dims)
        assert any("width" in e for e in errors)

    def test_margin_too_large_for_length(self):
        dims = {"length": 30.0, "width": 30.0, "thickness": 5.0, "hole_margin_mm": 20.0}
        errors = jig_validate(dims)
        assert any("hole_margin" in e for e in errors)

    def test_hole_diameter_too_small(self):
        dims = {"length": 100.0, "width": 60.0, "thickness": 5.0, "guide_hole_diameter": 0.5}
        errors = jig_validate(dims)
        assert any("guide_hole_diameter" in e for e in errors)


class TestSimpleJigNormalizedParams:
    def test_requested_variant(self):
        dims = {"length": 100.0, "width": 60.0, "thickness": 5.0}
        params = jig_params(dims, "requested")
        assert params["length_mm"] == 100.0
        assert params["width_mm"] == 60.0
        assert params["thickness_mm"] == 5.0
        assert params["guide_hole_diameter_mm"] == 3.0  # default
        assert params["hole_rows"] == 2
        assert params["hole_cols"] == 3

    def test_stronger_variant_increases_thickness(self):
        dims = {"length": 100.0, "width": 60.0, "thickness": 5.0}
        params = jig_params(dims, "stronger")
        assert params["thickness_mm"] == pytest.approx(6.5, rel=0.01)

    def test_custom_grid(self):
        dims = {
            "length": 150.0, "width": 80.0, "thickness": 6.0,
            "hole_rows": 3, "hole_cols": 5, "guide_hole_diameter": 4.0
        }
        params = jig_params(dims, "requested")
        assert params["hole_rows"] == 3
        assert params["hole_cols"] == 5
        assert params["guide_hole_diameter_mm"] == 4.0


# ─────────────────────────────────────────────────────────────
# Registry integration tests
# ─────────────────────────────────────────────────────────────
class TestNewGeneratorsRegistry:
    def test_all_new_generators_registered(self):
        from app.generators import is_supported, list_supported_families
        assert is_supported("flat_bracket")
        assert is_supported("standoff_block")
        assert is_supported("adapter_bushing")
        assert is_supported("simple_jig")

    def test_new_generators_not_in_partial(self):
        from app.generators import list_partial_families
        partials = list_partial_families()
        assert "flat_bracket" not in partials
        assert "standoff_block" not in partials
        assert "adapter_bushing" not in partials
        assert "simple_jig" not in partials

    def test_total_generator_count(self):
        from app.generators import list_supported_families
        families = list_supported_families()
        # 6 original + 4 new = 10
        assert len(families) == 10

    def test_get_generator_returns_correct_name(self):
        from app.generators import get_generator
        assert get_generator("flat_bracket")["name"] == FB_NAME
        assert get_generator("standoff_block")["name"] == SB_NAME
        assert get_generator("adapter_bushing")["name"] == AB_NAME
        assert get_generator("simple_jig")["name"] == JIG_NAME


# ─────────────────────────────────────────────────────────────
# Printer profile schema integration tests
# ─────────────────────────────────────────────────────────────
class TestPrinterProfileSchema:
    def test_default_printer_profile(self):
        from app.schemas.printer_profile import PrinterProfile
        profile = PrinterProfile()
        assert profile.layer_height_mm == 0.2
        assert profile.nozzle_diameter_mm == 0.4
        assert profile.xy_compensation_mm == 0.0
        assert profile.material == "PLA"

    def test_xy_compensation_expands_holes(self):
        from app.schemas.printer_profile import PrinterProfile
        profile = PrinterProfile(xy_compensation_mm=0.1)
        # 5mm hole + 0.1mm * 2 = 5.2mm
        assert profile.apply_xy_compensation(5.0) == pytest.approx(5.2)

    def test_xy_compensation_shrinks_holes(self):
        from app.schemas.printer_profile import PrinterProfile
        profile = PrinterProfile(xy_compensation_mm=-0.1)
        assert profile.apply_xy_compensation(5.0) == pytest.approx(4.8)

    def test_fits_in_build_volume(self):
        from app.schemas.printer_profile import PrinterProfile
        profile = PrinterProfile(build_x_mm=220.0, build_y_mm=220.0, build_z_mm=250.0)
        assert profile.fits_in_build_volume(100.0, 100.0, 50.0) is True
        assert profile.fits_in_build_volume(250.0, 100.0, 50.0) is False

    def test_generation_request_accepts_printer_profile(self):
        from app.schemas.generation_request import GenerationRequest
        from app.schemas.printer_profile import PrinterProfile
        from app.schemas.part_spec import PartSpec
        req = GenerationRequest(
            job_id="test-job-1",
            part_spec_id="test-spec-1",
            part_spec=PartSpec(
                family="flat_bracket",
                dimensions={"length": 80.0, "width": 30.0, "thickness": 3.0}
            ),
            printer_profile=PrinterProfile(xy_compensation_mm=0.15, material="PETG"),
        )
        assert req.printer_profile is not None
        assert req.printer_profile.material == "PETG"
        assert req.printer_profile.xy_compensation_mm == 0.15

    def test_generation_request_without_printer_profile(self):
        from app.schemas.generation_request import GenerationRequest
        from app.schemas.part_spec import PartSpec
        req = GenerationRequest(
            job_id="test-job-2",
            part_spec_id="test-spec-2",
            part_spec=PartSpec(
                family="spacer",
                dimensions={"outer_diameter": 20.0, "height": 15.0}
            ),
        )
        assert req.printer_profile is None

    def test_generation_result_has_print_time_field(self):
        from app.schemas.generation_request import GenerationResult
        result = GenerationResult(
            status="success",
            job_id="test-job-3",
            part_spec_id="test-spec-3",
            generator_name="flat_bracket",
            print_time_estimate_minutes=12.5,
        )
        assert result.print_time_estimate_minutes == 12.5
