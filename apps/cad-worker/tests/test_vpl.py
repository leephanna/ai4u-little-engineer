"""
Virtual Print Lab (VPL) test suite.

Tests cover:
  - validate_geometry: mesh loading, watertight check, volume, bounding box, score
  - analyze_heuristics: overhang, thin wall, bed adhesion risk
  - calculate_score: score aggregation, grade assignment, risk level
  - run_vpl: full integration pipeline on real and synthetic STLs
"""

import os
import sys
import struct

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.vpl.geometry_validator import validate_geometry, GeometryResult
from app.vpl.heuristic_analyzer import analyze_heuristics, HeuristicResult
from app.vpl.slicer_simulator import run_slicer, SlicerResult
from app.vpl.score_calculator import calculate_score
from app.vpl import run_vpl


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _write_binary_stl(path: str, triangles: list) -> None:
    """Write a minimal binary STL file from a list of (normal, v0, v1, v2) tuples."""
    with open(path, "wb") as f:
        f.write(b"\x00" * 80)
        f.write(struct.pack("<I", len(triangles)))
        for normal, v0, v1, v2 in triangles:
            f.write(struct.pack("<3f", *normal))
            f.write(struct.pack("<3f", *v0))
            f.write(struct.pack("<3f", *v1))
            f.write(struct.pack("<3f", *v2))
            f.write(struct.pack("<H", 0))


def _make_cube_stl(path: str, size: float = 20.0) -> None:
    """Write a watertight 20mm cube as binary STL (12 triangles)."""
    s = size
    triangles = [
        ((0, 0, -1), (0, 0, 0), (s, 0, 0), (s, s, 0)),
        ((0, 0, -1), (0, 0, 0), (s, s, 0), (0, s, 0)),
        ((0, 0, 1),  (0, 0, s), (s, s, s), (s, 0, s)),
        ((0, 0, 1),  (0, 0, s), (0, s, s), (s, s, s)),
        ((0, -1, 0), (0, 0, 0), (s, 0, s), (s, 0, 0)),
        ((0, -1, 0), (0, 0, 0), (0, 0, s), (s, 0, s)),
        ((0, 1, 0),  (0, s, 0), (s, s, 0), (s, s, s)),
        ((0, 1, 0),  (0, s, 0), (s, s, s), (0, s, s)),
        ((-1, 0, 0), (0, 0, 0), (0, s, 0), (0, s, s)),
        ((-1, 0, 0), (0, 0, 0), (0, s, s), (0, 0, s)),
        ((1, 0, 0),  (s, 0, 0), (s, 0, s), (s, s, s)),
        ((1, 0, 0),  (s, 0, 0), (s, s, s), (s, s, 0)),
    ]
    _write_binary_stl(path, triangles)


def _make_real_spacer_stl(path: str) -> None:
    """Generate a real spacer STL using the production generator."""
    import importlib
    import pytest
    if importlib.util.find_spec("build123d") is None:
        pytest.skip("build123d not installed — skipping real-geometry test")
    from app.generators.spacer import generate
    from app.exporters.stl_export import export_stl
    part = generate({"outer_diameter": 30.0, "inner_diameter": 10.0, "height": 15.0})
    export_stl(part, path)


def _make_dummy_geometry_result(score: int = 30, watertight: bool = True) -> GeometryResult:
    """Create a dummy GeometryResult for unit testing score calculator."""
    return GeometryResult(
        is_watertight=watertight,
        is_manifold=watertight,
        volume_cm3=8.0,
        bounding_box_mm={"x": 20.0, "y": 20.0, "z": 20.0},
        face_count=12,
        vertex_count=8,
        non_manifold_edges=0,
        min_wall_thickness_mm=20.0,
        issues=[],
        score_contribution=score,
    )


def _make_dummy_slicer_result(score: int = 40, success: bool = True) -> SlicerResult:
    """Create a dummy SlicerResult for unit testing score calculator."""
    return SlicerResult(
        success=success,
        print_time_seconds=420,
        print_time_human="7m 0s",
        filament_mm=375.0,
        filament_cm3=0.90,
        filament_g=1.08,
        layer_count=70,
        gcode_size_bytes=None,
        issues=[],
        score_contribution=score,
    )


def _make_dummy_heuristic_result(score: int = 30) -> HeuristicResult:
    """Create a dummy HeuristicResult for unit testing score calculator."""
    return HeuristicResult(
        needs_support=False,
        overhang_face_ratio=0.0,
        support_volume_estimate_cm3=0.0,
        bed_adhesion_risk="low",
        warping_risk="low",
        bridge_span_mm=None,
        printer_compatibility=["ender3", "prusa_mk4"],
        issues=[],
        recommendations=[],
        score_contribution=score,
    )


# ─────────────────────────────────────────────────────────────────────────────
# validate_geometry tests
# ─────────────────────────────────────────────────────────────────────────────

class TestValidateGeometry:
    def test_valid_cube_is_watertight(self, tmp_path):
        stl = str(tmp_path / "cube.stl")
        _make_cube_stl(stl)
        result = validate_geometry(stl)
        assert result.is_watertight is True

    def test_valid_cube_score_positive(self, tmp_path):
        """A valid cube should receive a positive geometry score (>= 20/30)."""
        stl = str(tmp_path / "cube.stl")
        _make_cube_stl(stl)
        result = validate_geometry(stl)
        assert result.score_contribution >= 20

    def test_valid_cube_volume_positive(self, tmp_path):
        stl = str(tmp_path / "cube.stl")
        _make_cube_stl(stl, size=20.0)
        result = validate_geometry(stl)
        assert result.volume_cm3 > 0

    def test_valid_cube_bounding_box(self, tmp_path):
        stl = str(tmp_path / "cube.stl")
        _make_cube_stl(stl, size=20.0)
        result = validate_geometry(stl)
        bb = result.bounding_box_mm
        assert abs(bb["x"] - 20.0) < 1.0
        assert abs(bb["y"] - 20.0) < 1.0
        assert abs(bb["z"] - 20.0) < 1.0

    def test_valid_cube_face_count(self, tmp_path):
        stl = str(tmp_path / "cube.stl")
        _make_cube_stl(stl, size=20.0)
        result = validate_geometry(stl)
        assert result.face_count == 12

    def test_valid_cube_no_size_issues(self, tmp_path):
        """A 20mm cube should not trigger any size-related issues."""
        stl = str(tmp_path / "cube.stl")
        _make_cube_stl(stl, size=20.0)
        result = validate_geometry(stl)
        size_issues = [i for i in result.issues if "build volume" in i.lower() or "wall" in i.lower()]
        assert size_issues == []

    def test_real_spacer_is_valid(self, tmp_path):
        stl = str(tmp_path / "spacer.stl")
        _make_real_spacer_stl(stl)
        result = validate_geometry(stl)
        assert result.is_watertight is True
        assert result.score_contribution == 30

    def test_to_dict_has_required_keys(self, tmp_path):
        stl = str(tmp_path / "cube.stl")
        _make_cube_stl(stl)
        result = validate_geometry(stl)
        d = result.to_dict()
        for key in ("is_watertight", "is_manifold", "volume_cm3", "bounding_box_mm",
                    "face_count", "vertex_count", "non_manifold_edges", "issues", "score_contribution"):
            assert key in d, f"Missing key: {key}"


# ─────────────────────────────────────────────────────────────────────────────
# analyze_heuristics tests
# ─────────────────────────────────────────────────────────────────────────────

class TestAnalyzeHeuristics:
    def test_cube_heuristics_return_result(self, tmp_path):
        """Heuristic analysis should return a HeuristicResult without errors."""
        stl = str(tmp_path / "cube.stl")
        _make_cube_stl(stl, size=20.0)
        geo = validate_geometry(stl)
        slicer = run_slicer(stl)
        result = analyze_heuristics(stl, geo, slicer)
        assert isinstance(result, HeuristicResult)

    def test_cube_score_is_positive(self, tmp_path):
        """A simple cube should receive a positive heuristic score."""
        stl = str(tmp_path / "cube.stl")
        _make_cube_stl(stl, size=20.0)
        geo = validate_geometry(stl)
        slicer = run_slicer(stl)
        result = analyze_heuristics(stl, geo, slicer)
        assert result.score_contribution > 0

    def test_overhang_ratio_is_float(self, tmp_path):
        stl = str(tmp_path / "cube.stl")
        _make_cube_stl(stl, size=20.0)
        geo = validate_geometry(stl)
        slicer = run_slicer(stl)
        result = analyze_heuristics(stl, geo, slicer)
        assert isinstance(result.overhang_face_ratio, float)
        assert 0.0 <= result.overhang_face_ratio <= 1.0

    def test_result_has_required_keys(self, tmp_path):
        stl = str(tmp_path / "cube.stl")
        _make_cube_stl(stl, size=20.0)
        geo = validate_geometry(stl)
        slicer = run_slicer(stl)
        result = analyze_heuristics(stl, geo, slicer)
        assert hasattr(result, "needs_support")
        assert hasattr(result, "overhang_face_ratio")
        assert hasattr(result, "bed_adhesion_risk")
        assert hasattr(result, "warping_risk")
        assert hasattr(result, "printer_compatibility")
        assert hasattr(result, "issues")
        assert hasattr(result, "recommendations")

    def test_real_spacer_heuristics(self, tmp_path):
        stl = str(tmp_path / "spacer.stl")
        _make_real_spacer_stl(stl)
        geo = validate_geometry(stl)
        slicer = run_slicer(stl)
        result = analyze_heuristics(stl, geo, slicer)
        assert result.score_contribution >= 20
        assert isinstance(result.issues, list)
        assert isinstance(result.recommendations, list)


# ─────────────────────────────────────────────────────────────────────────────
# calculate_score tests
# ─────────────────────────────────────────────────────────────────────────────

class TestCalculateScore:
    def test_perfect_score_is_100(self):
        geo = _make_dummy_geometry_result(score=30)
        slicer = _make_dummy_slicer_result(score=40)
        heuristic = _make_dummy_heuristic_result(score=30)
        result = calculate_score(geo, slicer, heuristic)
        assert result.print_success_score == 100

    def test_grade_a_for_score_85_plus(self):
        geo = _make_dummy_geometry_result(score=30)
        slicer = _make_dummy_slicer_result(score=38)
        heuristic = _make_dummy_heuristic_result(score=28)
        result = calculate_score(geo, slicer, heuristic)
        assert result.grade == "A"
        assert result.print_success_score >= 85

    def test_grade_b_for_score_70_to_84(self):
        geo = _make_dummy_geometry_result(score=25)
        slicer = _make_dummy_slicer_result(score=30)
        heuristic = _make_dummy_heuristic_result(score=20)
        result = calculate_score(geo, slicer, heuristic)
        assert result.grade == "B"
        assert 70 <= result.print_success_score <= 84

    def test_grade_f_for_score_below_30(self):
        geo = _make_dummy_geometry_result(score=0, watertight=False)
        slicer = _make_dummy_slicer_result(score=0, success=False)
        heuristic = _make_dummy_heuristic_result(score=0)
        result = calculate_score(geo, slicer, heuristic)
        assert result.grade == "F"
        assert result.print_success_score < 30

    def test_ready_to_print_true_for_grade_a(self):
        geo = _make_dummy_geometry_result(score=30, watertight=True)
        slicer = _make_dummy_slicer_result(score=40, success=True)
        heuristic = _make_dummy_heuristic_result(score=30)
        result = calculate_score(geo, slicer, heuristic)
        assert result.ready_to_print is True

    def test_ready_to_print_false_when_not_watertight(self):
        geo = _make_dummy_geometry_result(score=15, watertight=False)
        slicer = _make_dummy_slicer_result(score=40, success=True)
        heuristic = _make_dummy_heuristic_result(score=30)
        result = calculate_score(geo, slicer, heuristic)
        assert result.ready_to_print is False

    def test_risk_level_low_for_perfect_score(self):
        geo = _make_dummy_geometry_result(score=30)
        slicer = _make_dummy_slicer_result(score=40)
        heuristic = _make_dummy_heuristic_result(score=30)
        result = calculate_score(geo, slicer, heuristic)
        assert result.risk_level == "low"

    def test_risk_level_high_for_zero_score(self):
        geo = _make_dummy_geometry_result(score=0, watertight=False)
        slicer = _make_dummy_slicer_result(score=0, success=False)
        heuristic = _make_dummy_heuristic_result(score=0)
        result = calculate_score(geo, slicer, heuristic)
        assert result.risk_level == "high"

    def test_all_issues_aggregated(self):
        geo = _make_dummy_geometry_result(score=30)
        geo.issues = ["geo issue"]
        slicer = _make_dummy_slicer_result(score=40)
        slicer.issues = ["slicer issue"]
        heuristic = _make_dummy_heuristic_result(score=30)
        heuristic.issues = ["heuristic issue"]
        result = calculate_score(geo, slicer, heuristic)
        assert "geo issue" in result.all_issues
        assert "slicer issue" in result.all_issues
        assert "heuristic issue" in result.all_issues

    def test_score_breakdown_has_three_sections(self):
        geo = _make_dummy_geometry_result(score=30)
        slicer = _make_dummy_slicer_result(score=40)
        heuristic = _make_dummy_heuristic_result(score=30)
        result = calculate_score(geo, slicer, heuristic)
        assert "geometry" in result.score_breakdown
        assert "slicer" in result.score_breakdown
        assert "heuristics" in result.score_breakdown


# ─────────────────────────────────────────────────────────────────────────────
# run_vpl integration tests
# ─────────────────────────────────────────────────────────────────────────────

class TestRunVpl:
    def test_cube_returns_valid_result(self, tmp_path):
        stl = str(tmp_path / "cube.stl")
        _make_cube_stl(stl, size=20.0)
        result = run_vpl(stl)
        assert "print_success_score" in result
        assert "grade" in result
        assert "ready_to_print" in result
        assert "risk_level" in result
        assert 0 <= result["print_success_score"] <= 100

    def test_cube_grade_is_valid(self, tmp_path):
        """A simple cube should receive a valid grade (A–F)."""
        stl = str(tmp_path / "cube.stl")
        _make_cube_stl(stl, size=20.0)
        result = run_vpl(stl)
        assert result["grade"] in ("A", "B", "C", "D", "F")

    def test_cube_score_above_50(self, tmp_path):
        """A valid 20mm cube should score at least 50/100 (grade C or better)."""
        stl = str(tmp_path / "cube.stl")
        _make_cube_stl(stl, size=20.0)
        result = run_vpl(stl)
        assert result["print_success_score"] >= 50, (
            f"Expected score >= 50 for a simple cube, got {result['print_success_score']}"
        )

    def test_real_spacer_scores_well(self, tmp_path):
        stl = str(tmp_path / "spacer.stl")
        _make_real_spacer_stl(stl)
        result = run_vpl(stl)
        assert result["print_success_score"] >= 60
        assert result["grade"] in ("A", "B", "C")

    def test_elapsed_seconds_populated(self, tmp_path):
        stl = str(tmp_path / "cube.stl")
        _make_cube_stl(stl, size=20.0)
        result = run_vpl(stl)
        assert "elapsed_seconds" in result
        assert result["elapsed_seconds"] >= 0

    def test_all_issues_is_list(self, tmp_path):
        stl = str(tmp_path / "cube.stl")
        _make_cube_stl(stl, size=20.0)
        result = run_vpl(stl)
        assert isinstance(result["all_issues"], list)

    def test_all_recommendations_is_list(self, tmp_path):
        stl = str(tmp_path / "cube.stl")
        _make_cube_stl(stl, size=20.0)
        result = run_vpl(stl)
        assert isinstance(result["all_recommendations"], list)

    def test_score_breakdown_present(self, tmp_path):
        stl = str(tmp_path / "cube.stl")
        _make_cube_stl(stl, size=20.0)
        result = run_vpl(stl)
        assert "score_breakdown" in result
        bd = result["score_breakdown"]
        assert "geometry" in bd
        assert "slicer" in bd
        assert "heuristics" in bd

    def test_geometry_result_nested(self, tmp_path):
        stl = str(tmp_path / "cube.stl")
        _make_cube_stl(stl, size=20.0)
        result = run_vpl(stl)
        assert "geometry_result" in result
        gr = result["geometry_result"]
        assert "is_watertight" in gr
        assert "volume_cm3" in gr

    def test_slicer_result_nested(self, tmp_path):
        stl = str(tmp_path / "cube.stl")
        _make_cube_stl(stl, size=20.0)
        result = run_vpl(stl)
        assert "slicer_result" in result
        sr = result["slicer_result"]
        assert "success" in sr

    def test_heuristic_result_nested(self, tmp_path):
        stl = str(tmp_path / "cube.stl")
        _make_cube_stl(stl, size=20.0)
        result = run_vpl(stl)
        assert "heuristic_result" in result
        hr = result["heuristic_result"]
        assert "needs_support" in hr
