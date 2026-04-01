"""
AI4U Trust Policy Engine
==========================
Connects VPL confidence / risk data with project exposure state and
KeyGuardian secret-rotation urgency to produce a structured policy decision.

This module is the single source of truth for trust-tier assignment.
It does NOT rebuild VPL. It does NOT rebuild KeyGuardian.
It consumes their outputs and produces a PolicyDecision.

Trust Tiers (ascending confidence):
  unverified        — VPL missing or failed; cannot be public or sold
  low_confidence    — Private use only; warnings shown; not marketplace-eligible
  verified          — Can appear in library; limited share allowed
  trusted_commercial — Strong VPL result; marketplace-eligible; elevated KG priority
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Optional
import json


# ─────────────────────────────────────────────────────────────────────────────
# Trust tier constants
# ─────────────────────────────────────────────────────────────────────────────

class TrustTier:
    UNVERIFIED         = "unverified"
    LOW_CONFIDENCE     = "low_confidence"
    VERIFIED           = "verified"
    TRUSTED_COMMERCIAL = "trusted_commercial"

    ALL = [UNVERIFIED, LOW_CONFIDENCE, VERIFIED, TRUSTED_COMMERCIAL]

    # Numeric rank for comparisons (higher = more trusted)
    RANK = {
        UNVERIFIED:         0,
        LOW_CONFIDENCE:     1,
        VERIFIED:           2,
        TRUSTED_COMMERCIAL: 3,
    }


class RotationPriority:
    CRITICAL  = "critical"   # Immediate rotation required
    HIGH      = "high"       # Next scheduled window
    STANDARD  = "standard"   # Normal weekly/monthly cadence
    LOW       = "low"        # Manual-only, no urgency


class MonitoringLevel:
    ELEVATED  = "elevated"   # Frequent scans, tight thresholds
    STANDARD  = "standard"   # Normal cadence
    MINIMAL   = "minimal"    # Infrequent, low-risk


# ─────────────────────────────────────────────────────────────────────────────
# Input / output data models
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class VPLInput:
    """Subset of VPL result fields consumed by the Trust Policy Engine."""
    print_success_score: Optional[int] = None   # 0–100
    grade: Optional[str] = None                 # A, B, C, D, F
    ready_to_print: Optional[bool] = None
    risk_level: Optional[str] = None            # low, moderate, high
    vpl_test_id: Optional[str] = None
    # Anomaly signals derived from VPL run history
    consecutive_failures: int = 0               # # of consecutive VPL failures for this project
    failure_spike: bool = False                 # Unusual spike in generation attempts


@dataclass
class ProjectInput:
    """Project / marketplace exposure state."""
    project_id: str
    job_id: Optional[str] = None
    is_public: bool = False
    price: Optional[float] = None               # None = free; >0 = paid
    earnings_total: float = 0.0
    has_active_purchases: bool = False          # Any completed design_purchases rows
    # Anomaly signals
    unusual_download_spike: bool = False
    repeated_vpl_failures_on_new_project: bool = False


@dataclass
class AnomalyInput:
    """Lightweight anomaly signals aggregated from available data."""
    repeated_cad_failures: bool = False
    generation_spike: bool = False
    unusual_marketplace_activity: bool = False
    repeated_vpl_failures: bool = False


@dataclass
class PolicyDecision:
    """Structured output of the Trust Policy Engine."""
    trust_tier: str
    marketplace_allowed: bool
    public_listing_allowed: bool
    requires_operator_review: bool
    rotation_priority: str
    monitoring_level: str
    notes: list[str] = field(default_factory=list)
    # Metadata
    project_id: str = ""
    job_id: Optional[str] = None
    vpl_test_id: Optional[str] = None
    decided_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    # Raw inputs stored for audit trail
    decision_inputs: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        d = asdict(self)
        return d

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), indent=2)


# ─────────────────────────────────────────────────────────────────────────────
# Core policy rules
# ─────────────────────────────────────────────────────────────────────────────

def _assign_trust_tier(vpl: VPLInput, project: ProjectInput, anomaly: AnomalyInput) -> tuple[str, list[str]]:
    """
    Assign a trust tier based on VPL results and context.
    Returns (tier, notes).
    """
    notes: list[str] = []

    # ── UNVERIFIED: VPL missing, failed, or grade F ──────────────────────────
    if vpl.print_success_score is None or vpl.grade is None:
        notes.append("VPL result missing — design cannot be verified")
        return TrustTier.UNVERIFIED, notes

    if vpl.grade == "F" or (vpl.print_success_score is not None and vpl.print_success_score < 40):
        notes.append(f"VPL grade {vpl.grade} (score {vpl.print_success_score}) — design failed print validation")
        return TrustTier.UNVERIFIED, notes

    if vpl.risk_level == "high":
        notes.append("VPL risk level is HIGH — design flagged as unsafe for public distribution")
        return TrustTier.UNVERIFIED, notes

    # ── LOW_CONFIDENCE: grade D or score 40–59, or anomaly flags ─────────────
    if vpl.grade == "D" or (vpl.print_success_score is not None and vpl.print_success_score < 60):
        notes.append(f"VPL grade {vpl.grade} (score {vpl.print_success_score}) — low confidence; private use only")
        return TrustTier.LOW_CONFIDENCE, notes

    if vpl.consecutive_failures >= 3:
        notes.append(f"Design has {vpl.consecutive_failures} consecutive VPL failures — low confidence")
        return TrustTier.LOW_CONFIDENCE, notes

    if anomaly.repeated_vpl_failures and project.repeated_vpl_failures_on_new_project:
        notes.append("Repeated VPL failures on a newly created project — low confidence")
        return TrustTier.LOW_CONFIDENCE, notes

    # ── TRUSTED_COMMERCIAL: grade A or B, ready_to_print, has revenue/public ─
    if (
        vpl.grade in ("A", "B")
        and vpl.ready_to_print is True
        and vpl.risk_level in ("low", "moderate")
        and vpl.print_success_score is not None
        and vpl.print_success_score >= 75
        and (project.is_public or project.price is not None or project.has_active_purchases)
    ):
        notes.append(f"VPL grade {vpl.grade} (score {vpl.print_success_score}); public/paid asset — trusted commercial")
        if project.earnings_total > 0:
            notes.append(f"Revenue-generating asset (${project.earnings_total:.2f} earned) — elevated protection priority")
        return TrustTier.TRUSTED_COMMERCIAL, notes

    # ── VERIFIED: grade A or B, ready_to_print, but not yet public/paid ──────
    if vpl.grade in ("A", "B") and vpl.ready_to_print is True:
        notes.append(f"VPL grade {vpl.grade} (score {vpl.print_success_score}) — verified; eligible for library sharing")
        return TrustTier.VERIFIED, notes

    # ── VERIFIED: grade C, score 60–74, not risky ────────────────────────────
    if vpl.grade == "C" and vpl.risk_level in ("low", "moderate"):
        notes.append(f"VPL grade C (score {vpl.print_success_score}) — verified with moderate confidence")
        return TrustTier.VERIFIED, notes

    # Default fallback
    notes.append("Insufficient VPL data for higher tier assignment")
    return TrustTier.LOW_CONFIDENCE, notes


def _derive_marketplace_permissions(tier: str, project: ProjectInput) -> tuple[bool, bool]:
    """Return (marketplace_allowed, public_listing_allowed)."""
    if tier == TrustTier.TRUSTED_COMMERCIAL:
        return True, True
    if tier == TrustTier.VERIFIED:
        # Can appear in library but not sold unless explicitly priced
        return False, True
    # LOW_CONFIDENCE and UNVERIFIED: blocked from both
    return False, False


def _derive_rotation_priority(tier: str, project: ProjectInput, anomaly: AnomalyInput) -> str:
    """Derive KeyGuardian rotation priority from trust tier and exposure."""
    # Any anomaly with public exposure → critical
    if (anomaly.repeated_cad_failures or anomaly.generation_spike) and project.is_public:
        return RotationPriority.CRITICAL

    if tier == TrustTier.TRUSTED_COMMERCIAL:
        # High-value public/paid assets always get HIGH rotation priority
        return RotationPriority.HIGH

    if tier == TrustTier.VERIFIED and project.is_public:
        return RotationPriority.HIGH

    if tier == TrustTier.LOW_CONFIDENCE and project.is_public:
        return RotationPriority.STANDARD

    return RotationPriority.STANDARD


def _derive_monitoring_level(tier: str, project: ProjectInput, anomaly: AnomalyInput) -> str:
    """Derive KeyGuardian monitoring level."""
    if tier == TrustTier.TRUSTED_COMMERCIAL:
        return MonitoringLevel.ELEVATED

    if anomaly.repeated_cad_failures or anomaly.generation_spike or anomaly.unusual_marketplace_activity:
        return MonitoringLevel.ELEVATED

    if tier == TrustTier.VERIFIED and project.is_public:
        return MonitoringLevel.STANDARD

    if tier in (TrustTier.UNVERIFIED, TrustTier.LOW_CONFIDENCE):
        return MonitoringLevel.MINIMAL

    return MonitoringLevel.STANDARD


def _requires_operator_review(tier: str, project: ProjectInput, anomaly: AnomalyInput) -> bool:
    """Determine if an operator must review this decision."""
    # Any anomaly on a public or paid project
    if project.is_public and (anomaly.repeated_cad_failures or anomaly.generation_spike):
        return True
    # Unverified design that was previously public (downgrade scenario)
    if tier == TrustTier.UNVERIFIED and (project.is_public or project.has_active_purchases):
        return True
    # Repeated failures on new project
    if anomaly.repeated_vpl_failures and project.repeated_vpl_failures_on_new_project:
        return True
    return False


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

def evaluate_trust_policy(
    vpl: VPLInput,
    project: ProjectInput,
    anomaly: Optional[AnomalyInput] = None,
) -> PolicyDecision:
    """
    Evaluate the trust policy for a given VPL result and project state.
    Returns a PolicyDecision with tier, permissions, and KeyGuardian directives.

    This is the primary entry point for the Trust Policy Engine.
    """
    if anomaly is None:
        anomaly = AnomalyInput()

    tier, notes = _assign_trust_tier(vpl, project, anomaly)
    marketplace_allowed, public_listing_allowed = _derive_marketplace_permissions(tier, project)
    rotation_priority = _derive_rotation_priority(tier, project, anomaly)
    monitoring_level = _derive_monitoring_level(tier, project, anomaly)
    requires_review = _requires_operator_review(tier, project, anomaly)

    # Add KeyGuardian-specific notes
    if tier == TrustTier.TRUSTED_COMMERCIAL:
        notes.append("High-value public asset — tighten secret hygiene; rotation priority elevated")
    if project.is_public and tier in (TrustTier.UNVERIFIED, TrustTier.LOW_CONFIDENCE):
        notes.append("WARNING: Project is currently public but trust tier does not permit public listing")

    decision = PolicyDecision(
        trust_tier=tier,
        marketplace_allowed=marketplace_allowed,
        public_listing_allowed=public_listing_allowed,
        requires_operator_review=requires_review,
        rotation_priority=rotation_priority,
        monitoring_level=monitoring_level,
        notes=notes,
        project_id=project.project_id,
        job_id=project.job_id,
        vpl_test_id=vpl.vpl_test_id,
        decision_inputs={
            "vpl": {
                "print_success_score": vpl.print_success_score,
                "grade": vpl.grade,
                "ready_to_print": vpl.ready_to_print,
                "risk_level": vpl.risk_level,
                "consecutive_failures": vpl.consecutive_failures,
                "failure_spike": vpl.failure_spike,
            },
            "project": {
                "project_id": project.project_id,
                "is_public": project.is_public,
                "price": project.price,
                "earnings_total": project.earnings_total,
                "has_active_purchases": project.has_active_purchases,
            },
            "anomaly": {
                "repeated_cad_failures": anomaly.repeated_cad_failures,
                "generation_spike": anomaly.generation_spike,
                "unusual_marketplace_activity": anomaly.unusual_marketplace_activity,
                "repeated_vpl_failures": anomaly.repeated_vpl_failures,
            },
        },
    )

    return decision


def evaluate_from_dict(inputs: dict) -> PolicyDecision:
    """
    Convenience wrapper: build VPLInput, ProjectInput, AnomalyInput from
    a flat dict (e.g., from a Supabase row or API payload).
    """
    vpl_data = inputs.get("vpl", {})
    project_data = inputs.get("project", {})
    anomaly_data = inputs.get("anomaly", {})

    vpl = VPLInput(
        print_success_score=vpl_data.get("print_success_score"),
        grade=vpl_data.get("grade"),
        ready_to_print=vpl_data.get("ready_to_print"),
        risk_level=vpl_data.get("risk_level"),
        vpl_test_id=vpl_data.get("vpl_test_id"),
        consecutive_failures=vpl_data.get("consecutive_failures", 0),
        failure_spike=vpl_data.get("failure_spike", False),
    )
    project = ProjectInput(
        project_id=project_data.get("project_id", ""),
        job_id=project_data.get("job_id"),
        is_public=project_data.get("is_public", False),
        price=project_data.get("price"),
        earnings_total=project_data.get("earnings_total", 0.0),
        has_active_purchases=project_data.get("has_active_purchases", False),
        unusual_download_spike=project_data.get("unusual_download_spike", False),
        repeated_vpl_failures_on_new_project=project_data.get("repeated_vpl_failures_on_new_project", False),
    )
    anomaly = AnomalyInput(
        repeated_cad_failures=anomaly_data.get("repeated_cad_failures", False),
        generation_spike=anomaly_data.get("generation_spike", False),
        unusual_marketplace_activity=anomaly_data.get("unusual_marketplace_activity", False),
        repeated_vpl_failures=anomaly_data.get("repeated_vpl_failures", False),
    )
    return evaluate_trust_policy(vpl, project, anomaly)
