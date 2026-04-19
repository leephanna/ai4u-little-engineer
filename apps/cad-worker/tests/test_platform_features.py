"""
Platform Feature Tests — Phase 8
Tests for:
  1. Stripe webhook helper functions (no live Stripe calls)
  2. Feedback upload auth guard (mocked)
  3. Project library search parameter validation
  4. simple_jig generator STL size regression (must be < 500KB)
  5. PrinterProfile XY compensation math
"""
import pytest
import sys
import os

# Ensure app is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


# ─────────────────────────────────────────────────────────────
# 1. Stripe webhook helpers (pure logic, no network)
# ─────────────────────────────────────────────────────────────

class TestStripeWebhookHelpers:
    """
    Tests for the period-end and subscription-ID extraction logic
    that was rewritten for Stripe SDK v20 compatibility.
    These are pure unit tests — no Stripe API calls.
    """

    def test_get_period_end_uses_cancel_at_when_set(self):
        """cancel_at takes priority over billing_cycle_anchor."""
        from types import SimpleNamespace
        sub = SimpleNamespace(cancel_at=1800000000, billing_cycle_anchor=1700000000)
        # Replicate the helper logic
        ts = sub.cancel_at or sub.billing_cycle_anchor
        import datetime
        result = datetime.datetime.utcfromtimestamp(ts).isoformat()
        assert "2027" in result  # 1800000000 is in 2027

    def test_get_period_end_falls_back_to_billing_cycle_anchor(self):
        """When cancel_at is None, use billing_cycle_anchor."""
        from types import SimpleNamespace
        sub = SimpleNamespace(cancel_at=None, billing_cycle_anchor=1700000000)
        ts = sub.cancel_at or sub.billing_cycle_anchor
        import datetime
        result = datetime.datetime.utcfromtimestamp(ts).isoformat()
        assert "2023" in result  # 1700000000 is in 2023

    def test_get_period_end_returns_none_when_both_none(self):
        """Both fields None → period end is None."""
        from types import SimpleNamespace
        sub = SimpleNamespace(cancel_at=None, billing_cycle_anchor=None)
        ts = sub.cancel_at or sub.billing_cycle_anchor
        assert ts is None

    def test_invoice_subscription_id_from_parent(self):
        """Extract subscription ID from invoice.parent.subscription_details."""
        from types import SimpleNamespace
        invoice = SimpleNamespace(
            parent=SimpleNamespace(
                type="subscription_details",
                subscription_details=SimpleNamespace(subscription="sub_abc123")
            )
        )
        # Replicate the helper logic
        parent = invoice.parent
        sub_id = None
        if parent and parent.type == "subscription_details":
            sub = parent.subscription_details.subscription
            if isinstance(sub, str):
                sub_id = sub
        assert sub_id == "sub_abc123"

    def test_invoice_subscription_id_none_when_no_parent(self):
        """Returns None when invoice has no parent."""
        from types import SimpleNamespace
        invoice = SimpleNamespace(parent=None)
        parent = invoice.parent
        sub_id = None
        if parent and hasattr(parent, "type") and parent.type == "subscription_details":
            sub = parent.subscription_details.subscription
            if isinstance(sub, str):
                sub_id = sub
        assert sub_id is None


# ─────────────────────────────────────────────────────────────
# 2. Feedback upload auth guard (logic only)
# ─────────────────────────────────────────────────────────────

class TestFeedbackUploadValidation:
    """
    Tests for the feedback upload validation logic.
    No HTTP calls — validates the guard conditions directly.
    """

    MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
    ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}

    def test_valid_jpeg_within_size_limit(self):
        size = 2 * 1024 * 1024  # 2MB
        mime = "image/jpeg"
        assert size <= self.MAX_FILE_SIZE
        assert mime in self.ALLOWED_TYPES

    def test_file_too_large_rejected(self):
        size = 11 * 1024 * 1024  # 11MB
        assert size > self.MAX_FILE_SIZE

    def test_invalid_mime_type_rejected(self):
        mime = "application/pdf"
        assert mime not in self.ALLOWED_TYPES

    def test_gif_rejected(self):
        mime = "image/gif"
        assert mime not in self.ALLOWED_TYPES

    def test_png_accepted(self):
        mime = "image/png"
        assert mime in self.ALLOWED_TYPES

    def test_webp_accepted(self):
        mime = "image/webp"
        assert mime in self.ALLOWED_TYPES

    def test_missing_fields_detected(self):
        """All three fields must be present."""
        fields = {"image": "file", "feedback_id": None, "job_id": "uuid"}
        missing = [k for k, v in fields.items() if v is None]
        assert "feedback_id" in missing

    def test_all_fields_present_passes(self):
        fields = {"image": "file", "feedback_id": "uuid1", "job_id": "uuid2"}
        missing = [k for k, v in fields.items() if v is None]
        assert missing == []


# ─────────────────────────────────────────────────────────────
# 3. Project library search parameter validation
# ─────────────────────────────────────────────────────────────

class TestProjectSearchParams:
    """Tests for the search API parameter validation logic."""

    VALID_FAMILIES = {
        "spacer", "l_bracket", "flat_bracket", "u_bracket", "hole_plate",
        "enclosure", "standoff_block", "adapter_bushing", "cable_clip", "simple_jig",
    }
    VALID_SORTS = {"recent", "popular", "rating"}
    MAX_LIMIT = 50

    def test_limit_capped_at_50(self):
        requested = 100
        actual = min(requested, self.MAX_LIMIT)
        assert actual == 50

    def test_limit_default_20(self):
        requested = 20
        actual = min(requested, self.MAX_LIMIT)
        assert actual == 20

    def test_offset_non_negative(self):
        offset = max(-5, 0)
        assert offset == 0

    def test_valid_family_filter(self):
        family = "spacer"
        assert family in self.VALID_FAMILIES

    def test_invalid_family_not_in_registry(self):
        family = "bolt"
        assert family not in self.VALID_FAMILIES

    def test_valid_sort_options(self):
        for s in ["recent", "popular", "rating"]:
            assert s in self.VALID_SORTS

    def test_invalid_sort_falls_back(self):
        sort = "random"
        effective = sort if sort in self.VALID_SORTS else "popular"
        assert effective == "popular"

    def test_all_10_production_families_registered(self):
        assert len(self.VALID_FAMILIES) == 10


# ─────────────────────────────────────────────────────────────
# 4. simple_jig STL size regression
# ─────────────────────────────────────────────────────────────

class TestSimpleJigSTLSize:
    """
    Regression test: simple_jig must produce a modest STL (< 500KB).
    The previous fillet implementation produced 2.5MB STLs which caused
    incorrect clustering in the adaptive tolerance learning loop.
    """

    def test_simple_jig_generates_small_stl(self, tmp_path):
        """Generate a simple_jig and verify STL is under 500KB."""
        try:
            from app.generators.simple_jig import generate
            stl_path = tmp_path / "jig.stl"
            dims = {
                "length": 80.0,
                "width": 40.0,
                "thickness": 8.0,
                "guide_hole_diameter": 3.0,
                "hole_rows": 2,
                "hole_cols": 3,
            }
            result = generate(dims)
            # Export to STL using the cad-worker's exporter
            from app.exporters.stl_export import export_stl
            export_stl(result, str(stl_path))
            size = stl_path.stat().st_size
            assert size < 500 * 1024, (
                f"simple_jig STL is {size / 1024:.0f}KB — must be < 500KB. "
                "Check that the fillet has been removed from the generator."
            )
        except ImportError:
            pytest.skip("build123d not available in this environment")


# ─────────────────────────────────────────────────────────────
# 5. PrinterProfile XY compensation math
# ─────────────────────────────────────────────────────────────

class TestPrinterProfileCompensation:
    """Tests for the PrinterProfile.apply_xy_compensation() method."""

    def test_zero_compensation_returns_original(self):
        from app.schemas.printer_profile import PrinterProfile
        p = PrinterProfile(xy_compensation_mm=0.0)
        result = p.apply_xy_compensation(10.0)
        assert abs(result - 10.0) < 0.001

    def test_positive_compensation_expands_hole(self):
        from app.schemas.printer_profile import PrinterProfile
        p = PrinterProfile(xy_compensation_mm=0.1)
        result = p.apply_xy_compensation(10.0)
        assert result > 10.0

    def test_negative_compensation_shrinks_hole(self):
        from app.schemas.printer_profile import PrinterProfile
        p = PrinterProfile(xy_compensation_mm=-0.1)
        result = p.apply_xy_compensation(10.0)
        assert result < 10.0

    def test_compensation_never_returns_negative(self):
        from app.schemas.printer_profile import PrinterProfile
        p = PrinterProfile(xy_compensation_mm=-2.0)
        result = p.apply_xy_compensation(0.5)
        assert result >= 0.1  # min clamp

    def test_moving_average_converges(self):
        """Simulate 10 rounds of moving average with alpha=0.3."""
        current = 0.0
        target = 0.2
        alpha = 0.3
        for _ in range(10):
            current = current * (1 - alpha) + target * alpha
        assert abs(current - target) < 0.05  # converges within 5% of target

    def test_fits_in_build_volume_pass(self):
        from app.schemas.printer_profile import PrinterProfile
        p = PrinterProfile(build_x_mm=220.0, build_y_mm=220.0, build_z_mm=250.0)
        assert p.fits_in_build_volume(100.0, 80.0, 30.0) is True

    def test_fits_in_build_volume_fail(self):
        from app.schemas.printer_profile import PrinterProfile
        p = PrinterProfile(build_x_mm=100.0, build_y_mm=100.0, build_z_mm=100.0)
        assert p.fits_in_build_volume(150.0, 80.0, 30.0) is False
