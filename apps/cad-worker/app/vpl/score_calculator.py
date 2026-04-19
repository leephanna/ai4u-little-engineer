"""
VPL Score Calculator
====================
Aggregates geometry, slicer, and heuristic scores into a single
Print Success Score (0-100) with grade and risk level.

Score breakdown:
  - Geometry validation:  0-30 pts
  - Slicer simulation:    0-40 pts
  - Heuristic analysis:   0-30 pts
  Total:                  0-100 pts

Grades:
  A: 85-100  (Ready to print — high confidence)
  B: 70-84   (Good — minor issues)
  C: 50-69   (Caution — review recommendations)
  D: 30-49   (Poor — significant issues)
  F: 0-29    (Fail — not printable without rework)
"""
from __future__ import annotations

from dataclasses import dataclass

from .geometry_validator import GeometryResult
from .slicer_simulator import SlicerResult
from .heuristic_analyzer import HeuristicResult


@dataclass
class ScoreResult:
    print_success_score: int        # 0-100
    grade: str                      # A/B/C/D/F
    ready_to_print: bool
    risk_level: str                 # low / moderate / high
    all_issues: list[str]
    all_recommendations: list[str]
    score_breakdown: dict

    def to_dict(self) -> dict:
        return {
            "print_success_score": self.print_success_score,
            "grade": self.grade,
            "ready_to_print": self.ready_to_print,
            "risk_level": self.risk_level,
            "all_issues": self.all_issues,
            "all_recommendations": self.all_recommendations,
            "score_breakdown": self.score_breakdown,
        }


def calculate_score(
    geometry: GeometryResult,
    slicer: SlicerResult,
    heuristic: HeuristicResult,
) -> ScoreResult:
    """Aggregate component scores into a final Print Success Score."""
    geo_pts = geometry.score_contribution    # 0-30
    slicer_pts = slicer.score_contribution   # 0-40
    heuristic_pts = heuristic.score_contribution  # 0-30

    total = geo_pts + slicer_pts + heuristic_pts  # 0-100

    # Grade
    if total >= 85:
        grade = "A"
    elif total >= 70:
        grade = "B"
    elif total >= 50:
        grade = "C"
    elif total >= 30:
        grade = "D"
    else:
        grade = "F"

    # Ready to print: A or B grade, watertight, slicer succeeded
    ready_to_print = (
        total >= 70
        and geometry.is_watertight
        and slicer.success
    )

    # Risk level
    if total >= 85:
        risk_level = "low"
    elif total >= 50:
        risk_level = "moderate"
    else:
        risk_level = "high"

    # Aggregate issues and recommendations
    all_issues = geometry.issues + slicer.issues + heuristic.issues
    all_recommendations = heuristic.recommendations

    # Add slicer-derived recommendations
    if slicer.print_time_seconds and slicer.print_time_seconds > 7200:
        all_recommendations.append(f"Long print ({slicer.print_time_human}) — ensure reliable power and filament supply")
    if slicer.filament_g and slicer.filament_g > 50:
        all_recommendations.append(f"High material usage ({slicer.filament_g:.1f}g) — verify filament spool has sufficient material")

    score_breakdown = {
        "geometry": {
            "score": geo_pts,
            "max": 30,
            "pct": round(geo_pts / 30 * 100),
            "is_watertight": geometry.is_watertight,
            "is_manifold": geometry.is_manifold,
            "volume_cm3": geometry.volume_cm3,
            "bounding_box_mm": geometry.bounding_box_mm,
            "non_manifold_edges": geometry.non_manifold_edges,
        },
        "slicer": {
            "score": slicer_pts,
            "max": 40,
            "pct": round(slicer_pts / 40 * 100),
            "success": slicer.success,
            "print_time_human": slicer.print_time_human,
            "print_time_seconds": slicer.print_time_seconds,
            "filament_cm3": slicer.filament_cm3,
            "filament_g": slicer.filament_g,
            "layer_count": slicer.layer_count,
        },
        "heuristics": {
            "score": heuristic_pts,
            "max": 30,
            "pct": round(heuristic_pts / 30 * 100),
            "needs_support": heuristic.needs_support,
            "overhang_face_ratio": heuristic.overhang_face_ratio,
            "bed_adhesion_risk": heuristic.bed_adhesion_risk,
            "warping_risk": heuristic.warping_risk,
            "bridge_span_mm": heuristic.bridge_span_mm,
            "printer_compatibility": heuristic.printer_compatibility,
        },
    }

    return ScoreResult(
        print_success_score=total,
        grade=grade,
        ready_to_print=ready_to_print,
        risk_level=risk_level,
        all_issues=all_issues,
        all_recommendations=all_recommendations,
        score_breakdown=score_breakdown,
    )
