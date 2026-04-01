"""
AI4U Trust Policy — Anomaly Bridge
=====================================
Derives lightweight anomaly signals from available data sources.
This is NOT a full SIEM. It produces actionable boolean signals
for the Trust Policy Engine.

Signal sources:
  - Repeated failed CAD runs (from cad_runs table)
  - Unusual spike in generation attempts (from jobs table)
  - Repeated VPL failures on newly created projects
  - Unusual marketplace activity (download/purchase spikes)

All signals are computed from Supabase query results passed in as dicts.
This module does NOT make database calls directly — it processes data
that has already been fetched by the caller.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from trust_policy_engine import AnomalyInput


# Thresholds (tunable)
CAD_FAILURE_THRESHOLD = 3          # consecutive failures to flag
GENERATION_SPIKE_MULTIPLIER = 3.0  # 3x the user's 7-day average
VPL_FAILURE_THRESHOLD = 3          # consecutive VPL failures
PURCHASE_SPIKE_MULTIPLIER = 5.0    # 5x the project's average daily purchases


def derive_anomaly_signals(
    recent_cad_statuses: list[str],
    recent_job_counts: dict,
    recent_vpl_statuses: list[str],
    recent_purchase_counts: dict,
    project_age_days: Optional[int] = None,
) -> AnomalyInput:
    """
    Derive anomaly signals from pre-fetched data.

    Args:
        recent_cad_statuses:   List of recent cad_run status strings (newest first),
                               e.g. ["failed", "failed", "failed", "completed"]
        recent_job_counts:     Dict with keys "today" and "avg_7d" (job counts)
        recent_vpl_statuses:   List of recent VPL test status strings (newest first)
        recent_purchase_counts: Dict with keys "today" and "avg_7d" (purchase counts)
        project_age_days:      Age of the project in days (None if unknown)

    Returns:
        AnomalyInput with boolean signal flags.
    """
    # ── Signal 1: Repeated CAD failures ──────────────────────────────────────
    repeated_cad_failures = False
    if recent_cad_statuses:
        consecutive = 0
        for status in recent_cad_statuses:
            if status == "failed":
                consecutive += 1
            else:
                break
        repeated_cad_failures = consecutive >= CAD_FAILURE_THRESHOLD

    # ── Signal 2: Generation spike ────────────────────────────────────────────
    generation_spike = False
    today_jobs = recent_job_counts.get("today", 0)
    avg_jobs = recent_job_counts.get("avg_7d", 0)
    if avg_jobs > 0 and today_jobs >= avg_jobs * GENERATION_SPIKE_MULTIPLIER:
        generation_spike = True
    elif avg_jobs == 0 and today_jobs >= 10:
        # No history but high absolute count
        generation_spike = True

    # ── Signal 3: Repeated VPL failures ──────────────────────────────────────
    repeated_vpl_failures = False
    if recent_vpl_statuses:
        consecutive_vpl = 0
        for status in recent_vpl_statuses:
            if status in ("failed", "F"):
                consecutive_vpl += 1
            else:
                break
        repeated_vpl_failures = consecutive_vpl >= VPL_FAILURE_THRESHOLD

    # ── Signal 4: Unusual marketplace activity ────────────────────────────────
    unusual_marketplace_activity = False
    today_purchases = recent_purchase_counts.get("today", 0)
    avg_purchases = recent_purchase_counts.get("avg_7d", 0)
    if avg_purchases > 0 and today_purchases >= avg_purchases * PURCHASE_SPIKE_MULTIPLIER:
        unusual_marketplace_activity = True
    elif avg_purchases == 0 and today_purchases >= 20:
        unusual_marketplace_activity = True

    return AnomalyInput(
        repeated_cad_failures=repeated_cad_failures,
        generation_spike=generation_spike,
        unusual_marketplace_activity=unusual_marketplace_activity,
        repeated_vpl_failures=repeated_vpl_failures,
    )


def describe_anomalies(anomaly: AnomalyInput) -> list[str]:
    """Return human-readable descriptions of active anomaly signals."""
    descriptions = []
    if anomaly.repeated_cad_failures:
        descriptions.append(f"Repeated CAD generation failures detected (≥{CAD_FAILURE_THRESHOLD} consecutive)")
    if anomaly.generation_spike:
        descriptions.append(f"Unusual spike in generation attempts (≥{GENERATION_SPIKE_MULTIPLIER}x average)")
    if anomaly.repeated_vpl_failures:
        descriptions.append(f"Repeated VPL failures detected (≥{VPL_FAILURE_THRESHOLD} consecutive)")
    if anomaly.unusual_marketplace_activity:
        descriptions.append(f"Unusual marketplace activity (≥{PURCHASE_SPIKE_MULTIPLIER}x average purchase rate)")
    return descriptions
