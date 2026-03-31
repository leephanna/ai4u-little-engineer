"""
Virtual Print Lab (VPL)
=======================
Entry point for the VPL engine. Runs all three analysis stages and
returns a unified result dict ready for Supabase persistence.
"""
from __future__ import annotations

import time
from typing import Optional

from .geometry_validator import validate_geometry, GeometryResult
from .slicer_simulator import run_slicer, SlicerResult
from .heuristic_analyzer import analyze_heuristics, HeuristicResult
from .score_calculator import calculate_score, ScoreResult


def run_vpl(stl_path: str, slicer_settings: Optional[dict] = None) -> dict:
    """
    Run the full VPL pipeline on an STL file.

    Returns a dict with keys:
        geometry_result, slicer_result, heuristic_result,
        print_success_score, grade, ready_to_print, risk_level,
        score_breakdown, all_issues, all_recommendations,
        elapsed_seconds
    """
    t0 = time.time()

    # Stage 1: Geometry validation
    geometry: GeometryResult = validate_geometry(stl_path)

    # Stage 2: Slicer simulation
    slicer: SlicerResult = run_slicer(stl_path, settings=slicer_settings)

    # Stage 3: Heuristic analysis
    heuristic: HeuristicResult = analyze_heuristics(stl_path, geometry, slicer)

    # Stage 4: Score aggregation
    score: ScoreResult = calculate_score(geometry, slicer, heuristic)

    elapsed = round(time.time() - t0, 2)

    return {
        "geometry_result": geometry.to_dict(),
        "slicer_result": slicer.to_dict(),
        "heuristic_result": heuristic.to_dict(),
        "print_success_score": score.print_success_score,
        "grade": score.grade,
        "ready_to_print": score.ready_to_print,
        "risk_level": score.risk_level,
        "score_breakdown": score.score_breakdown,
        "all_issues": score.all_issues,
        "all_recommendations": score.all_recommendations,
        "elapsed_seconds": elapsed,
    }


__all__ = [
    "run_vpl",
    "validate_geometry",
    "run_slicer",
    "analyze_heuristics",
    "calculate_score",
]
