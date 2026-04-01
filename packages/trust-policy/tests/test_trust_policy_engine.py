"""
Trust Policy Engine — Test Suite
==================================
Tests all core components of the Trust Policy Engine:
  1. evaluate_trust_policy() — tier assignment logic
  2. derive_anomaly_signals() — anomaly signal derivation
  3. Marketplace gating logic (marketplace_allowed / public_listing_allowed)
  4. KeyGuardian directives (rotation_priority, monitoring_level)
  5. Operator review flag
  6. KeyGuardian trust integration (priority adjustments)
  7. Output schema validation
  8. Edge cases and boundary conditions
"""
from __future__ import annotations

import sys
import os
import pytest

# ── Path setup ───────────────────────────────────────────────────────────────
TRUST_POLICY_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
# KeyGuardian lives at /home/ubuntu/keyguardian (outside the le-repo)
KEYGUARDIAN_DIR = "/home/ubuntu/keyguardian"
sys.path.insert(0, TRUST_POLICY_DIR)
sys.path.insert(0, KEYGUARDIAN_DIR)

from trust_policy_engine import (
    evaluate_trust_policy,
    evaluate_from_dict,
    VPLInput,
    ProjectInput,
    AnomalyInput,
    PolicyDecision,
    TrustTier,
    RotationPriority,
    MonitoringLevel,
)
from anomaly_bridge import derive_anomaly_signals, describe_anomalies


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _vpl(grade="A", score=92, ready=True, risk="low", failures=0, spike=False, test_id="t1"):
    return VPLInput(
        print_success_score=score,
        grade=grade,
        ready_to_print=ready,
        risk_level=risk,
        vpl_test_id=test_id,
        consecutive_failures=failures,
        failure_spike=spike,
    )


def _proj(project_id="p1", is_public=False, price=None, earnings=0.0,
          purchases=False, download_spike=False, vpl_fail_new=False):
    return ProjectInput(
        project_id=project_id,
        is_public=is_public,
        price=price,
        earnings_total=earnings,
        has_active_purchases=purchases,
        unusual_download_spike=download_spike,
        repeated_vpl_failures_on_new_project=vpl_fail_new,
    )


def _anomaly(cad=False, spike=False, market=False, vpl=False):
    return AnomalyInput(
        repeated_cad_failures=cad,
        generation_spike=spike,
        unusual_marketplace_activity=market,
        repeated_vpl_failures=vpl,
    )


# ─────────────────────────────────────────────────────────────────────────────
# 1. Tier assignment — happy paths
# ─────────────────────────────────────────────────────────────────────────────

class TestTierAssignment:
    """Tests that the correct trust tier is assigned based on VPL inputs."""

    def test_grade_a_public_paid_gets_trusted_commercial(self):
        out = evaluate_trust_policy(_vpl("A", 92), _proj(is_public=True, price=4.99))
        assert out.trust_tier == TrustTier.TRUSTED_COMMERCIAL
        assert out.marketplace_allowed is True
        assert out.public_listing_allowed is True

    def test_grade_b_public_paid_gets_trusted_commercial(self):
        out = evaluate_trust_policy(_vpl("B", 78), _proj(is_public=True, price=2.99))
        assert out.trust_tier == TrustTier.TRUSTED_COMMERCIAL

    def test_grade_a_private_free_gets_verified(self):
        out = evaluate_trust_policy(_vpl("A", 90), _proj(is_public=False, price=None))
        assert out.trust_tier == TrustTier.VERIFIED
        assert out.marketplace_allowed is False  # Not public/paid

    def test_grade_b_private_gets_verified(self):
        out = evaluate_trust_policy(_vpl("B", 75), _proj(is_public=False))
        assert out.trust_tier == TrustTier.VERIFIED

    def test_grade_c_low_risk_gets_verified(self):
        """Grade C with low risk should be VERIFIED (not LOW_CONFIDENCE)."""
        out = evaluate_trust_policy(_vpl("C", 65, ready=False, risk="low"), _proj())
        assert out.trust_tier == TrustTier.VERIFIED

    def test_grade_d_gets_low_confidence(self):
        out = evaluate_trust_policy(_vpl("D", 45, ready=False), _proj())
        assert out.trust_tier == TrustTier.LOW_CONFIDENCE
        assert out.marketplace_allowed is False

    def test_grade_f_gets_unverified(self):
        out = evaluate_trust_policy(_vpl("F", 20, ready=False, risk="high"), _proj())
        assert out.trust_tier == TrustTier.UNVERIFIED
        assert out.marketplace_allowed is False
        assert out.public_listing_allowed is False

    def test_no_vpl_data_gets_unverified(self):
        vpl = VPLInput(print_success_score=None, grade=None)
        out = evaluate_trust_policy(vpl, _proj())
        assert out.trust_tier == TrustTier.UNVERIFIED

    def test_high_risk_level_gets_unverified(self):
        """High risk level should force UNVERIFIED regardless of grade."""
        out = evaluate_trust_policy(_vpl("B", 80, risk="high"), _proj())
        assert out.trust_tier == TrustTier.UNVERIFIED

    def test_consecutive_failures_gets_low_confidence(self):
        out = evaluate_trust_policy(_vpl("B", 75, failures=3), _proj())
        assert out.trust_tier == TrustTier.LOW_CONFIDENCE

    def test_score_below_40_gets_unverified(self):
        out = evaluate_trust_policy(_vpl("D", 35, ready=False), _proj())
        assert out.trust_tier == TrustTier.UNVERIFIED

    def test_score_40_to_59_gets_low_confidence(self):
        out = evaluate_trust_policy(_vpl("D", 50, ready=False), _proj())
        assert out.trust_tier == TrustTier.LOW_CONFIDENCE

    def test_has_active_purchases_elevates_to_trusted_commercial(self):
        """A design with active purchases (even if not explicitly public) should be trusted commercial."""
        out = evaluate_trust_policy(
            _vpl("A", 85),
            _proj(is_public=False, purchases=True),
        )
        assert out.trust_tier == TrustTier.TRUSTED_COMMERCIAL


# ─────────────────────────────────────────────────────────────────────────────
# 2. Marketplace gating
# ─────────────────────────────────────────────────────────────────────────────

class TestMarketplaceGating:
    """Tests the marketplace_allowed and public_listing_allowed flags."""

    def test_trusted_commercial_allows_marketplace(self):
        out = evaluate_trust_policy(_vpl("A", 92), _proj(is_public=True, price=5.0))
        assert out.marketplace_allowed is True

    def test_verified_private_blocks_marketplace(self):
        out = evaluate_trust_policy(_vpl("A", 90), _proj(is_public=False, price=None))
        assert out.marketplace_allowed is False

    def test_verified_allows_public_listing(self):
        out = evaluate_trust_policy(_vpl("A", 90), _proj(is_public=True, price=None))
        # Verified tier → public_listing_allowed = True
        assert out.public_listing_allowed is True

    def test_low_confidence_blocks_marketplace_even_if_public(self):
        out = evaluate_trust_policy(_vpl("D", 45, ready=False), _proj(is_public=True, price=1.99))
        assert out.marketplace_allowed is False

    def test_unverified_blocks_marketplace(self):
        out = evaluate_trust_policy(_vpl("F", 20, ready=False), _proj(is_public=True, price=0.99))
        assert out.marketplace_allowed is False

    def test_unverified_blocks_public_listing(self):
        out = evaluate_trust_policy(_vpl("F", 20, ready=False), _proj(is_public=True))
        assert out.public_listing_allowed is False


# ─────────────────────────────────────────────────────────────────────────────
# 3. Operator review flag
# ─────────────────────────────────────────────────────────────────────────────

class TestOperatorReview:
    """Tests that requires_operator_review is set correctly."""

    def test_anomaly_on_public_project_triggers_review(self):
        out = evaluate_trust_policy(
            _vpl("B", 75),
            _proj(is_public=True),
            _anomaly(cad=True),
        )
        assert out.requires_operator_review is True

    def test_unverified_public_project_triggers_review(self):
        out = evaluate_trust_policy(
            _vpl("F", 20, ready=False),
            _proj(is_public=True),
        )
        assert out.requires_operator_review is True

    def test_unverified_with_purchases_triggers_review(self):
        out = evaluate_trust_policy(
            _vpl("F", 20, ready=False),
            _proj(purchases=True),
        )
        assert out.requires_operator_review is True

    def test_clean_grade_a_private_no_review(self):
        out = evaluate_trust_policy(_vpl("A", 92), _proj())
        assert out.requires_operator_review is False

    def test_repeated_vpl_failures_on_new_project_triggers_review(self):
        out = evaluate_trust_policy(
            _vpl("C", 55, failures=3),
            _proj(vpl_fail_new=True),
            _anomaly(vpl=True),
        )
        assert out.requires_operator_review is True


# ─────────────────────────────────────────────────────────────────────────────
# 4. KeyGuardian directives
# ─────────────────────────────────────────────────────────────────────────────

class TestKeyGuardianDirectives:
    """Tests that the correct rotation priority and monitoring level are set."""

    def test_trusted_commercial_gets_high_priority(self):
        out = evaluate_trust_policy(_vpl("A", 92), _proj(is_public=True, price=5.0))
        assert out.rotation_priority == RotationPriority.HIGH
        assert out.monitoring_level == MonitoringLevel.ELEVATED

    def test_anomaly_on_public_gets_critical_priority(self):
        out = evaluate_trust_policy(
            _vpl("B", 75),
            _proj(is_public=True),
            _anomaly(cad=True),
        )
        assert out.rotation_priority == RotationPriority.CRITICAL

    def test_verified_public_gets_high_priority(self):
        out = evaluate_trust_policy(_vpl("A", 90), _proj(is_public=True))
        assert out.rotation_priority == RotationPriority.HIGH

    def test_low_confidence_private_gets_standard_priority(self):
        out = evaluate_trust_policy(_vpl("D", 45, ready=False), _proj())
        assert out.rotation_priority == RotationPriority.STANDARD

    def test_unverified_private_gets_standard_priority(self):
        out = evaluate_trust_policy(_vpl("F", 20, ready=False), _proj())
        assert out.rotation_priority == RotationPriority.STANDARD

    def test_trusted_commercial_gets_elevated_monitoring(self):
        out = evaluate_trust_policy(_vpl("A", 92), _proj(is_public=True, price=5.0))
        assert out.monitoring_level == MonitoringLevel.ELEVATED

    def test_anomaly_elevates_monitoring(self):
        out = evaluate_trust_policy(
            _vpl("B", 75),
            _proj(),
            _anomaly(spike=True),
        )
        assert out.monitoring_level == MonitoringLevel.ELEVATED

    def test_unverified_private_gets_minimal_monitoring(self):
        out = evaluate_trust_policy(_vpl("F", 20, ready=False), _proj())
        assert out.monitoring_level == MonitoringLevel.MINIMAL


# ─────────────────────────────────────────────────────────────────────────────
# 5. AnomalyBridge — derive_anomaly_signals
# ─────────────────────────────────────────────────────────────────────────────

class TestAnomalyBridge:
    """Tests the anomaly signal derivation from pre-fetched data."""

    def test_no_anomalies_for_clean_data(self):
        result = derive_anomaly_signals(
            recent_cad_statuses=["completed", "completed", "completed"],
            recent_job_counts={"today": 2, "avg_7d": 3},
            recent_vpl_statuses=["passed", "passed"],
            recent_purchase_counts={"today": 1, "avg_7d": 2},
        )
        assert result.repeated_cad_failures is False
        assert result.generation_spike is False
        assert result.repeated_vpl_failures is False
        assert result.unusual_marketplace_activity is False

    def test_three_consecutive_cad_failures_detected(self):
        result = derive_anomaly_signals(
            recent_cad_statuses=["failed", "failed", "failed", "completed"],
            recent_job_counts={"today": 1, "avg_7d": 1},
            recent_vpl_statuses=[],
            recent_purchase_counts={"today": 0, "avg_7d": 0},
        )
        assert result.repeated_cad_failures is True

    def test_two_consecutive_cad_failures_not_flagged(self):
        result = derive_anomaly_signals(
            recent_cad_statuses=["failed", "failed", "completed"],
            recent_job_counts={"today": 1, "avg_7d": 1},
            recent_vpl_statuses=[],
            recent_purchase_counts={"today": 0, "avg_7d": 0},
        )
        assert result.repeated_cad_failures is False

    def test_generation_spike_detected(self):
        result = derive_anomaly_signals(
            recent_cad_statuses=[],
            recent_job_counts={"today": 30, "avg_7d": 5},  # 6x average → spike
            recent_vpl_statuses=[],
            recent_purchase_counts={"today": 0, "avg_7d": 0},
        )
        assert result.generation_spike is True

    def test_generation_spike_no_history_high_count(self):
        result = derive_anomaly_signals(
            recent_cad_statuses=[],
            recent_job_counts={"today": 15, "avg_7d": 0},  # No history, 15 today
            recent_vpl_statuses=[],
            recent_purchase_counts={"today": 0, "avg_7d": 0},
        )
        assert result.generation_spike is True

    def test_vpl_failures_detected(self):
        result = derive_anomaly_signals(
            recent_cad_statuses=[],
            recent_job_counts={"today": 1, "avg_7d": 1},
            recent_vpl_statuses=["failed", "failed", "failed", "passed"],
            recent_purchase_counts={"today": 0, "avg_7d": 0},
        )
        assert result.repeated_vpl_failures is True

    def test_vpl_grade_f_counted_as_failure(self):
        result = derive_anomaly_signals(
            recent_cad_statuses=[],
            recent_job_counts={"today": 1, "avg_7d": 1},
            recent_vpl_statuses=["F", "F", "F"],
            recent_purchase_counts={"today": 0, "avg_7d": 0},
        )
        assert result.repeated_vpl_failures is True

    def test_purchase_spike_detected(self):
        result = derive_anomaly_signals(
            recent_cad_statuses=[],
            recent_job_counts={"today": 1, "avg_7d": 1},
            recent_vpl_statuses=[],
            recent_purchase_counts={"today": 100, "avg_7d": 5},  # 20x average → spike
        )
        assert result.unusual_marketplace_activity is True

    def test_purchase_spike_no_history_high_count(self):
        result = derive_anomaly_signals(
            recent_cad_statuses=[],
            recent_job_counts={"today": 1, "avg_7d": 1},
            recent_vpl_statuses=[],
            recent_purchase_counts={"today": 25, "avg_7d": 0},
        )
        assert result.unusual_marketplace_activity is True

    def test_empty_inputs_no_anomalies(self):
        result = derive_anomaly_signals(
            recent_cad_statuses=[],
            recent_job_counts={},
            recent_vpl_statuses=[],
            recent_purchase_counts={},
        )
        assert result.repeated_cad_failures is False
        assert result.generation_spike is False
        assert result.repeated_vpl_failures is False
        assert result.unusual_marketplace_activity is False

    def test_describe_anomalies_returns_list(self):
        anomaly = AnomalyInput(
            repeated_cad_failures=True,
            generation_spike=True,
            unusual_marketplace_activity=False,
            repeated_vpl_failures=False,
        )
        descriptions = describe_anomalies(anomaly)
        assert isinstance(descriptions, list)
        assert len(descriptions) == 2

    def test_describe_anomalies_empty_when_clean(self):
        anomaly = AnomalyInput()
        descriptions = describe_anomalies(anomaly)
        assert descriptions == []


# ─────────────────────────────────────────────────────────────────────────────
# 6. evaluate_from_dict convenience wrapper
# ─────────────────────────────────────────────────────────────────────────────

class TestEvaluateFromDict:
    """Tests the evaluate_from_dict convenience wrapper."""

    def test_basic_dict_input(self):
        result = evaluate_from_dict({
            "vpl": {"grade": "A", "print_success_score": 90, "ready_to_print": True, "risk_level": "low"},
            "project": {"project_id": "p1", "is_public": True, "price": 5.0},
            "anomaly": {},
        })
        assert result.trust_tier == TrustTier.TRUSTED_COMMERCIAL

    def test_empty_vpl_gets_unverified(self):
        result = evaluate_from_dict({
            "vpl": {},
            "project": {"project_id": "p2"},
            "anomaly": {},
        })
        assert result.trust_tier == TrustTier.UNVERIFIED

    def test_missing_sections_handled_gracefully(self):
        result = evaluate_from_dict({
            "vpl": {"grade": "B", "print_success_score": 75, "ready_to_print": True, "risk_level": "low"},
        })
        assert result.trust_tier is not None


# ─────────────────────────────────────────────────────────────────────────────
# 7. KeyGuardian trust integration
# ─────────────────────────────────────────────────────────────────────────────

class TestKeyGuardianTrustIntegration:
    """Tests the trust_integration module that adjusts KeyGuardian priorities."""

    def test_import_trust_integration(self):
        from core.trust_integration import (
            TrustPolicySignal, apply_trust_signals,
            get_prioritized_manual_secrets, build_trust_summary,
        )
        assert TrustPolicySignal is not None
        assert apply_trust_signals is not None

    def test_trusted_commercial_signal_sets_high_priority(self):
        from core.trust_integration import (
            TrustPolicySignal, apply_trust_signals, TrustTier as KGTrustTier,
            TrustRotationPriority,
        )
        signal = TrustPolicySignal(
            project_id="test-001",
            project_slug="ai4u-little-engineer",
            trust_tier=KGTrustTier.TRUSTED_COMMERCIAL,
            marketplace_allowed=True,
            rotation_priority=TrustRotationPriority.HIGH,
            monitoring_level="elevated",
            requires_operator_review=False,
            notes=[],
            earnings_total=100.0,
            is_public=True,
        )
        adjustments = apply_trust_signals([signal])
        assert len(adjustments) > 0
        for adj in adjustments:
            assert adj.new_priority in (TrustRotationPriority.HIGH, TrustRotationPriority.CRITICAL)

    def test_unverified_signal_sets_standard_priority(self):
        from core.trust_integration import (
            TrustPolicySignal, apply_trust_signals, TrustTier as KGTrustTier,
            TrustRotationPriority,
        )
        signal = TrustPolicySignal(
            project_id="test-002",
            project_slug="ai4u-little-engineer",
            trust_tier=KGTrustTier.UNVERIFIED,
            marketplace_allowed=False,
            rotation_priority=TrustRotationPriority.STANDARD,
            monitoring_level="minimal",
            requires_operator_review=False,
            notes=[],
        )
        adjustments = apply_trust_signals([signal])
        for adj in adjustments:
            assert adj.new_priority == TrustRotationPriority.STANDARD

    def test_review_required_with_public_escalates_to_critical(self):
        from core.trust_integration import (
            TrustPolicySignal, apply_trust_signals, TrustTier as KGTrustTier,
            TrustRotationPriority,
        )
        signal = TrustPolicySignal(
            project_id="test-003",
            project_slug="ai4u-little-engineer",
            trust_tier=KGTrustTier.LOW_CONFIDENCE,
            marketplace_allowed=False,
            rotation_priority=TrustRotationPriority.STANDARD,
            monitoring_level="minimal",
            requires_operator_review=True,
            notes=["Anomaly detected"],
            is_public=True,
        )
        adjustments = apply_trust_signals([signal])
        assert any(adj.new_priority == TrustRotationPriority.CRITICAL for adj in adjustments)

    def test_build_trust_summary_structure(self):
        from core.trust_integration import (
            TrustPolicySignal, apply_trust_signals, build_trust_summary,
            TrustTier as KGTrustTier, TrustRotationPriority,
        )
        signals = [
            TrustPolicySignal(
                project_id="p1",
                project_slug="ai4u-little-engineer",
                trust_tier=KGTrustTier.TRUSTED_COMMERCIAL,
                marketplace_allowed=True,
                rotation_priority=TrustRotationPriority.HIGH,
                monitoring_level="elevated",
                requires_operator_review=False,
                notes=[],
                earnings_total=50.0,
                is_public=True,
            )
        ]
        adjustments = apply_trust_signals(signals)
        summary = build_trust_summary(signals, adjustments)
        assert "trusted_commercial_assets" in summary
        assert "blocked_assets" in summary
        assert "high_priority_secrets_count" in summary
        assert "surfaced_manual_secrets" in summary
        assert "adjustments" in summary
        assert summary["trusted_commercial_assets"] == 1

    def test_get_prioritized_manual_secrets_returns_list(self):
        from core.trust_integration import (
            get_prioritized_manual_secrets, TrustPolicySignal,
            TrustTier as KGTrustTier, TrustRotationPriority,
        )
        signals = [
            TrustPolicySignal(
                project_id="p1",
                project_slug="ai4u-little-engineer",
                trust_tier=KGTrustTier.TRUSTED_COMMERCIAL,
                marketplace_allowed=True,
                rotation_priority=TrustRotationPriority.HIGH,
                monitoring_level="elevated",
                requires_operator_review=False,
                notes=[],
            )
        ]
        result = get_prioritized_manual_secrets(signals)
        assert isinstance(result, list)
        for s in result:
            assert not s.can_auto_rotate


# ─────────────────────────────────────────────────────────────────────────────
# 8. Output schema validation
# ─────────────────────────────────────────────────────────────────────────────

class TestOutputSchema:
    """Tests that PolicyDecision always has all required fields."""

    def test_output_has_all_required_fields(self):
        out = evaluate_trust_policy(_vpl("A", 92), _proj(is_public=True, price=5.0))
        assert out.trust_tier is not None
        assert isinstance(out.marketplace_allowed, bool)
        assert isinstance(out.public_listing_allowed, bool)
        assert isinstance(out.requires_operator_review, bool)
        assert out.rotation_priority is not None
        assert out.monitoring_level is not None
        assert isinstance(out.notes, list)

    def test_output_serializes_to_dict(self):
        out = evaluate_trust_policy(_vpl("B", 78), _proj(is_public=True, price=2.99))
        d = out.to_dict()
        assert isinstance(d, dict)
        assert "trust_tier" in d
        assert "marketplace_allowed" in d
        assert "rotation_priority" in d

    def test_output_serializes_to_json(self):
        import json
        out = evaluate_trust_policy(_vpl("A", 90), _proj())
        j = out.to_json()
        parsed = json.loads(j)
        assert "trust_tier" in parsed

    def test_valid_tier_values_for_all_grades(self):
        valid_tiers = {TrustTier.UNVERIFIED, TrustTier.LOW_CONFIDENCE, TrustTier.VERIFIED, TrustTier.TRUSTED_COMMERCIAL}
        for grade, score, ready in [("A", 92, True), ("B", 75, True), ("C", 62, False), ("D", 45, False), ("F", 20, False)]:
            out = evaluate_trust_policy(_vpl(grade, score, ready), _proj())
            assert out.trust_tier in valid_tiers, f"Invalid tier for grade {grade}: {out.trust_tier}"

    def test_valid_rotation_priority_values(self):
        valid = {RotationPriority.CRITICAL, RotationPriority.HIGH, RotationPriority.STANDARD, RotationPriority.LOW}
        for grade, score, ready in [("A", 92, True), ("B", 75, True), ("C", 62, False), ("D", 45, False), ("F", 20, False)]:
            out = evaluate_trust_policy(_vpl(grade, score, ready), _proj())
            assert out.rotation_priority in valid

    def test_valid_monitoring_level_values(self):
        valid = {MonitoringLevel.ELEVATED, MonitoringLevel.STANDARD, MonitoringLevel.MINIMAL}
        for grade, score, ready in [("A", 92, True), ("B", 75, True), ("C", 62, False), ("D", 45, False), ("F", 20, False)]:
            out = evaluate_trust_policy(_vpl(grade, score, ready), _proj())
            assert out.monitoring_level in valid

    def test_decision_inputs_stored_in_output(self):
        out = evaluate_trust_policy(_vpl("A", 92), _proj(project_id="myproj"))
        assert "vpl" in out.decision_inputs
        assert "project" in out.decision_inputs
        assert "anomaly" in out.decision_inputs

    def test_project_id_propagated(self):
        out = evaluate_trust_policy(_vpl("A", 92), _proj(project_id="proj-xyz"))
        assert out.project_id == "proj-xyz"


# ─────────────────────────────────────────────────────────────────────────────
# 9. Edge cases and boundary conditions
# ─────────────────────────────────────────────────────────────────────────────

class TestEdgeCases:
    """Edge cases and boundary conditions."""

    def test_score_exactly_75_with_grade_b_public_gets_trusted_commercial(self):
        out = evaluate_trust_policy(_vpl("B", 75, ready=True, risk="low"), _proj(is_public=True))
        assert out.trust_tier == TrustTier.TRUSTED_COMMERCIAL

    def test_score_74_with_grade_b_public_gets_verified(self):
        """Score 74 is below the 75 threshold for trusted_commercial."""
        out = evaluate_trust_policy(_vpl("B", 74, ready=True, risk="low"), _proj(is_public=True))
        assert out.trust_tier == TrustTier.VERIFIED

    def test_score_exactly_40_gets_low_confidence(self):
        out = evaluate_trust_policy(_vpl("D", 40, ready=False), _proj())
        assert out.trust_tier == TrustTier.LOW_CONFIDENCE

    def test_score_39_gets_unverified(self):
        out = evaluate_trust_policy(_vpl("D", 39, ready=False), _proj())
        assert out.trust_tier == TrustTier.UNVERIFIED

    def test_earnings_alone_does_not_upgrade_low_confidence(self):
        """Grade D with high earnings should still be LOW_CONFIDENCE."""
        out = evaluate_trust_policy(_vpl("D", 45, ready=False), _proj(earnings=500.0, is_public=True))
        assert out.trust_tier != TrustTier.TRUSTED_COMMERCIAL
        assert out.marketplace_allowed is False

    def test_multiple_anomaly_signals_all_considered(self):
        out = evaluate_trust_policy(
            _vpl("B", 75),
            _proj(is_public=True),
            _anomaly(cad=True, spike=True, market=True),
        )
        assert out.rotation_priority == RotationPriority.CRITICAL
        assert out.monitoring_level == MonitoringLevel.ELEVATED

    def test_empty_project_id_handled(self):
        out = evaluate_trust_policy(_vpl("A", 92), _proj(project_id=""))
        assert out.trust_tier is not None

    def test_notes_list_always_present(self):
        out = evaluate_trust_policy(_vpl("A", 92), _proj())
        assert isinstance(out.notes, list)
        assert len(out.notes) > 0  # Should always have at least one note

    def test_grade_c_moderate_risk_gets_low_confidence(self):
        """Grade C with moderate risk should be VERIFIED (moderate is still allowed)."""
        out = evaluate_trust_policy(_vpl("C", 65, ready=False, risk="moderate"), _proj())
        assert out.trust_tier == TrustTier.VERIFIED

    def test_generation_spike_alone_does_not_block_marketplace(self):
        """A generation spike alone (without public exposure) should not block marketplace."""
        out = evaluate_trust_policy(
            _vpl("A", 92),
            _proj(is_public=True, price=5.0),
            _anomaly(spike=True),
        )
        # Spike on public project → critical priority, but tier still trusted_commercial
        assert out.trust_tier == TrustTier.TRUSTED_COMMERCIAL
        assert out.rotation_priority == RotationPriority.CRITICAL
