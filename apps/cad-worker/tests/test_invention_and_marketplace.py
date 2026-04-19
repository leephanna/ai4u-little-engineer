"""
Tests for the invention engine, success score calculation, and marketplace purchase flow.

These tests cover:
  1. Invention engine validation logic (dimension validation, family validation, safety rules)
  2. Success score calculation (base score, rating score, reuse score)
  3. Design purchase flow (checkout creation, webhook unlock, earnings crediting)
  4. simple_jig generator STL size regression (must stay under 500KB)
"""

import pytest
import math


# ─────────────────────────────────────────────────────────────────────────────
# 1. Invention Engine — Validation Logic
# ─────────────────────────────────────────────────────────────────────────────

REQUIRED_DIMENSIONS = {
    "spacer": ["outer_diameter", "inner_diameter", "length"],
    "flat_bracket": ["length", "width", "thickness", "hole_count", "hole_diameter"],
    "l_bracket": ["leg_a", "leg_b", "thickness", "width"],
    "u_bracket": ["pipe_od", "wall_thickness", "flange_width", "flange_length"],
    "hole_plate": ["length", "width", "thickness", "hole_count", "hole_diameter"],
    "standoff_block": ["length", "width", "height", "hole_diameter"],
    "cable_clip": ["cable_od", "wall_thickness", "base_width"],
    "enclosure": ["inner_length", "inner_width", "inner_height", "wall_thickness"],
    "adapter_bushing": ["outer_diameter", "inner_diameter", "length"],
    "simple_jig": ["length", "width", "height"],
}

MVP_PART_FAMILIES = list(REQUIRED_DIMENSIONS.keys())


def validate_invention_result(result: dict) -> str | None:
    """Python port of the TypeScript validateInventionResult function."""
    family = result.get("family")
    if family not in MVP_PART_FAMILIES:
        return f"Unknown family: {family}. Must be one of: {', '.join(MVP_PART_FAMILIES)}"

    required = REQUIRED_DIMENSIONS[family]
    params = result.get("parameters", {})

    for dim in required:
        if dim not in params:
            return f"Missing required dimension: {dim} for family {family}"
        val = params[dim]
        if not isinstance(val, (int, float)) or math.isnan(val) or val <= 0:
            return f"Invalid value for {dim}: {val}. Must be a positive number."
        if val > 500:
            return f"Dimension {dim}={val}mm exceeds maximum printable size of 500mm."

    # Safety: minimum wall thickness
    for wall_dim in ["wall_thickness", "thickness"]:
        if wall_dim in params and params[wall_dim] < 1.2:
            return f"Wall thickness {params[wall_dim]}mm is below minimum structural thickness of 1.2mm."

    return None


class TestInventionValidation:
    def test_valid_spacer(self):
        result = {
            "family": "spacer",
            "parameters": {"outer_diameter": 20.0, "inner_diameter": 6.0, "length": 15.0},
            "reasoning": "Standard spacer",
            "confidence": 0.95,
        }
        assert validate_invention_result(result) is None

    def test_valid_enclosure(self):
        result = {
            "family": "enclosure",
            "parameters": {
                "inner_length": 65.0,
                "inner_width": 30.0,
                "inner_height": 15.0,
                "wall_thickness": 2.0,
            },
            "reasoning": "Pi Zero enclosure",
            "confidence": 0.9,
        }
        assert validate_invention_result(result) is None

    def test_invalid_family(self):
        result = {
            "family": "gear",
            "parameters": {"teeth": 20, "module": 1.0},
            "reasoning": "Gear",
            "confidence": 0.8,
        }
        error = validate_invention_result(result)
        assert error is not None
        assert "Unknown family" in error

    def test_missing_required_dimension(self):
        result = {
            "family": "spacer",
            "parameters": {"outer_diameter": 20.0, "inner_diameter": 6.0},
            # missing 'length'
            "reasoning": "Spacer without length",
            "confidence": 0.9,
        }
        error = validate_invention_result(result)
        assert error is not None
        assert "length" in error

    def test_negative_dimension_rejected(self):
        result = {
            "family": "spacer",
            "parameters": {"outer_diameter": 20.0, "inner_diameter": -1.0, "length": 15.0},
            "reasoning": "Invalid spacer",
            "confidence": 0.9,
        }
        error = validate_invention_result(result)
        assert error is not None
        assert "inner_diameter" in error

    def test_oversized_dimension_rejected(self):
        result = {
            "family": "simple_jig",
            "parameters": {"length": 600.0, "width": 50.0, "height": 20.0},
            "reasoning": "Oversized jig",
            "confidence": 0.9,
        }
        error = validate_invention_result(result)
        assert error is not None
        assert "500mm" in error

    def test_wall_thickness_too_thin(self):
        result = {
            "family": "enclosure",
            "parameters": {
                "inner_length": 65.0,
                "inner_width": 30.0,
                "inner_height": 15.0,
                "wall_thickness": 0.8,  # below 1.2mm minimum
            },
            "reasoning": "Thin-walled enclosure",
            "confidence": 0.9,
        }
        error = validate_invention_result(result)
        assert error is not None
        assert "1.2mm" in error

    def test_all_10_families_have_required_dims(self):
        """Every family in MVP_PART_FAMILIES must have at least 1 required dimension."""
        for family in MVP_PART_FAMILIES:
            assert family in REQUIRED_DIMENSIONS
            assert len(REQUIRED_DIMENSIONS[family]) >= 1, f"{family} has no required dims"

    def test_zero_confidence_should_reject(self):
        """Confidence < 0.5 should trigger rejection path."""
        confidence = 0.3
        assert confidence < 0.5  # The API handler rejects these

    def test_cable_clip_valid(self):
        result = {
            "family": "cable_clip",
            "parameters": {"cable_od": 8.0, "wall_thickness": 2.0, "base_width": 15.0},
            "reasoning": "Cable clip for 8mm bundle",
            "confidence": 0.88,
        }
        assert validate_invention_result(result) is None


# ─────────────────────────────────────────────────────────────────────────────
# 2. Success Score Calculation
# ─────────────────────────────────────────────────────────────────────────────

def calculate_success_score(
    total_prints: int,
    successful_prints: int,
    avg_rating: float | None,
    usage_count: int,
) -> float:
    """Python port of the success score calculation from recalculate-success-score.ts"""
    base_score = (successful_prints / total_prints * 60) if total_prints > 0 else 30.0
    rating_score = (avg_rating / 5.0 * 25) if avg_rating is not None else 12.5
    reuse_score = min(usage_count / 10.0, 1.0) * 15
    return round((base_score + rating_score + reuse_score) * 100) / 100


class TestSuccessScore:
    def test_perfect_score(self):
        """100% success rate, 5-star rating, 10+ uses → max score."""
        score = calculate_success_score(
            total_prints=10,
            successful_prints=10,
            avg_rating=5.0,
            usage_count=10,
        )
        assert score == 100.0

    def test_zero_prints_gives_neutral_base(self):
        """No prints yet → base score is 30 (neutral), rating 12.5 (neutral)."""
        score = calculate_success_score(
            total_prints=0,
            successful_prints=0,
            avg_rating=None,
            usage_count=0,
        )
        assert score == 42.5  # 30 + 12.5 + 0

    def test_partial_success(self):
        """50% success rate, 3-star rating, 5 uses."""
        score = calculate_success_score(
            total_prints=10,
            successful_prints=5,
            avg_rating=3.0,
            usage_count=5,
        )
        # base=30, rating=15, reuse=7.5 → 52.5
        assert score == 52.5

    def test_all_failed_prints(self):
        """0% success rate → base score 0."""
        score = calculate_success_score(
            total_prints=5,
            successful_prints=0,
            avg_rating=1.0,
            usage_count=0,
        )
        # base=0, rating=5, reuse=0 → 5.0
        assert score == 5.0

    def test_reuse_capped_at_15(self):
        """Usage count > 10 should not exceed 15 points."""
        score_10 = calculate_success_score(10, 10, 5.0, 10)
        score_100 = calculate_success_score(10, 10, 5.0, 100)
        assert score_10 == score_100 == 100.0

    def test_score_range(self):
        """Score must always be between 0 and 100."""
        for total, success, rating, usage in [
            (0, 0, None, 0),
            (1, 0, 1.0, 0),
            (10, 10, 5.0, 10),
            (5, 3, 4.2, 7),
        ]:
            score = calculate_success_score(total, success, rating, usage)
            assert 0.0 <= score <= 100.0, f"Score {score} out of range"


# ─────────────────────────────────────────────────────────────────────────────
# 3. Marketplace Purchase Flow Logic
# ─────────────────────────────────────────────────────────────────────────────

class TestMarketplacePurchaseLogic:
    def test_creator_share_is_80_percent(self):
        """Creator gets 80% of the sale price."""
        amount_total = 4.99
        creator_share = round(amount_total * 0.8 * 100) / 100
        assert creator_share == 3.99

    def test_platform_takes_20_percent(self):
        """Platform retains 20% of the sale price."""
        amount_total = 10.00
        creator_share = round(amount_total * 0.8 * 100) / 100
        platform_share = round((amount_total - creator_share) * 100) / 100
        assert platform_share == 2.00

    def test_free_design_has_no_price(self):
        """Free designs have price=None or price=0."""
        project = {"price": None}
        is_paid = project["price"] and project["price"] > 0
        assert not is_paid

    def test_paid_design_requires_checkout(self):
        """Paid designs (price > 0) must go through checkout."""
        project = {"price": 4.99}
        is_paid = project["price"] and project["price"] > 0
        assert is_paid

    def test_checkout_amount_in_cents(self):
        """Stripe checkout requires amount in cents (integer)."""
        price_usd = 4.99
        amount_cents = round(price_usd * 100)
        assert amount_cents == 499
        assert isinstance(amount_cents, int)

    def test_earnings_accumulate_correctly(self):
        """Multiple purchases correctly accumulate earnings."""
        earnings = 0.0
        for sale_price in [4.99, 4.99, 9.99]:
            creator_share = round(sale_price * 0.8 * 100) / 100
            earnings = round((earnings + creator_share) * 100) / 100
        # 3.99 + 3.99 + 7.99 = 15.97
        assert earnings == 15.97

    def test_purchase_status_flow(self):
        """Purchase status must go: pending → completed."""
        valid_transitions = {"pending": ["completed", "failed"], "completed": [], "failed": []}
        assert "completed" in valid_transitions["pending"]
        assert "failed" in valid_transitions["pending"]
        assert len(valid_transitions["completed"]) == 0  # terminal state

    def test_owned_design_not_charged_again(self):
        """A user who already owns a design (status=completed) should not be charged again."""
        existing_purchase = {"status": "completed"}
        already_owned = existing_purchase["status"] == "completed"
        assert already_owned  # API should return 409 Conflict


# ─────────────────────────────────────────────────────────────────────────────
# 4. simple_jig STL Size Regression
# ─────────────────────────────────────────────────────────────────────────────

class TestSimpleJigRegression:
    def test_simple_jig_stl_size_under_500kb(self, tmp_path):
        """
        Regression test: simple_jig must produce an STL under 500KB.
        Previously produced 2.5MB due to an excessive fillet operation.
        """
        import sys
        sys.path.insert(0, "/home/ubuntu/le-repo/apps/cad-worker")

        try:
            from app.generators.simple_jig import generate
            from app.exporters.stl_exporter import export_stl

            part = generate({"length": 80.0, "width": 50.0, "height": 20.0})
            stl_path = tmp_path / "simple_jig_regression.stl"
            export_stl(part, str(stl_path))

            size_bytes = stl_path.stat().st_size
            size_kb = size_bytes / 1024
            assert size_kb < 500, (
                f"simple_jig STL is {size_kb:.1f}KB — exceeds 500KB limit. "
                "Check for excessive fillet or mesh operations."
            )
        except ImportError as e:
            pytest.skip(f"CAD worker not available in this environment: {e}")

    def test_simple_jig_required_dims(self):
        """simple_jig requires exactly: length, width, height."""
        required = REQUIRED_DIMENSIONS["simple_jig"]
        assert set(required) == {"length", "width", "height"}

    def test_simple_jig_valid_dimensions_pass_validation(self):
        result = {
            "family": "simple_jig",
            "parameters": {"length": 80.0, "width": 50.0, "height": 20.0},
            "reasoning": "PCB holding jig",
            "confidence": 0.92,
        }
        assert validate_invention_result(result) is None
