"""
VPL Heuristic Analyzer
=======================
Applies printability heuristics based on geometry and slicer data:
- Overhang detection (via face normals)
- Support requirement estimation
- Bed adhesion risk
- Warping risk (based on footprint and material)
- Bridge span estimation
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

import trimesh
import numpy as np

from .geometry_validator import GeometryResult
from .slicer_simulator import SlicerResult


@dataclass
class HeuristicResult:
    overhang_face_ratio: float          # 0.0-1.0 fraction of faces with >45° overhang
    needs_support: bool
    support_volume_estimate_cm3: float
    bed_adhesion_risk: str              # 'low' | 'moderate' | 'high'
    warping_risk: str                   # 'low' | 'moderate' | 'high'
    bridge_span_mm: Optional[float]     # estimated max bridge span
    printer_compatibility: list[str]    # list of compatible printer profiles
    recommendations: list[str] = field(default_factory=list)
    issues: list[str] = field(default_factory=list)
    score_contribution: int = 0         # 0-30 points

    def to_dict(self) -> dict:
        return {
            "overhang_face_ratio": round(self.overhang_face_ratio, 4),
            "needs_support": self.needs_support,
            "support_volume_estimate_cm3": round(self.support_volume_estimate_cm3, 4),
            "bed_adhesion_risk": self.bed_adhesion_risk,
            "warping_risk": self.warping_risk,
            "bridge_span_mm": self.bridge_span_mm,
            "printer_compatibility": self.printer_compatibility,
            "recommendations": self.recommendations,
            "issues": self.issues,
            "score_contribution": self.score_contribution,
        }


def analyze_heuristics(
    stl_path: str,
    geometry: GeometryResult,
    slicer: SlicerResult,
) -> HeuristicResult:
    """Run printability heuristics on the mesh."""
    mesh = trimesh.load_mesh(stl_path, force="mesh")
    issues: list[str] = []
    recommendations: list[str] = []

    # --- Overhang detection ---
    # Face normals with Z-component < -cos(45°) = -0.707 are overhangs
    normals = mesh.face_normals
    overhang_threshold = -0.707  # 45 degrees
    overhang_mask = normals[:, 2] < overhang_threshold
    overhang_face_ratio = float(np.sum(overhang_mask) / max(len(normals), 1))
    needs_support = overhang_face_ratio > 0.05  # >5% overhang faces

    if needs_support:
        issues.append(f"Overhangs detected ({overhang_face_ratio:.1%} of faces) — supports required")
        recommendations.append("Orient part to minimize overhangs before printing")

    # Estimate support volume as fraction of part volume
    support_volume_estimate_cm3 = geometry.volume_cm3 * overhang_face_ratio * 0.3 if needs_support else 0.0

    # --- Bed adhesion risk ---
    bbox = geometry.bounding_box_mm
    footprint_area = bbox["x"] * bbox["y"]  # mm²
    height_to_base_ratio = bbox["z"] / max(min(bbox["x"], bbox["y"]), 1)

    if footprint_area < 100:  # < 10×10mm footprint
        bed_adhesion_risk = "high"
        issues.append("Small footprint — high risk of bed adhesion failure")
        recommendations.append("Add a brim (3-5mm) to improve bed adhesion")
    elif height_to_base_ratio > 5:
        bed_adhesion_risk = "moderate"
        recommendations.append("Tall, narrow part — consider a brim for stability")
    else:
        bed_adhesion_risk = "low"

    # --- Warping risk ---
    # Based on footprint area and aspect ratio
    aspect_ratio = max(bbox["x"], bbox["y"]) / max(min(bbox["x"], bbox["y"]), 1)
    if footprint_area > 10000 and aspect_ratio > 3:  # large, elongated part
        warping_risk = "high"
        issues.append("Large elongated footprint — high warping risk with PLA")
        recommendations.append("Use an enclosure or switch to PETG/ABS for large flat parts")
    elif footprint_area > 5000:
        warping_risk = "moderate"
        recommendations.append("Consider using a heated bed and enclosure for best results")
    else:
        warping_risk = "low"

    # --- Bridge span estimation ---
    # Simple heuristic: largest XY dimension of overhanging faces
    bridge_span_mm = None
    if needs_support:
        # Estimate bridge span from overhang face extents
        overhang_verts = mesh.vertices[mesh.faces[overhang_mask].flatten()]
        if len(overhang_verts) > 0:
            span_x = float(overhang_verts[:, 0].max() - overhang_verts[:, 0].min())
            span_y = float(overhang_verts[:, 1].max() - overhang_verts[:, 1].min())
            bridge_span_mm = round(max(span_x, span_y), 2)
            if bridge_span_mm > 50:
                issues.append(f"Large bridge span ({bridge_span_mm:.1f}mm) — supports strongly recommended")

    # --- Printer compatibility ---
    printer_compatibility = []
    if bbox["x"] <= 220 and bbox["y"] <= 220 and bbox["z"] <= 250:
        printer_compatibility.append("Creality Ender 3 / 3 Pro / 3 V2")
    if bbox["x"] <= 235 and bbox["y"] <= 235 and bbox["z"] <= 250:
        printer_compatibility.append("Creality Ender 3 S1")
    if bbox["x"] <= 300 and bbox["y"] <= 300 and bbox["z"] <= 340:
        printer_compatibility.append("Creality CR-10")
    if bbox["x"] <= 250 and bbox["y"] <= 210 and bbox["z"] <= 210:
        printer_compatibility.append("Prusa MK3S+")
    if bbox["x"] <= 256 and bbox["y"] <= 256 and bbox["z"] <= 256:
        printer_compatibility.append("Bambu Lab P1S")
    if not printer_compatibility:
        issues.append("Part exceeds build volume of all standard printers")

    # --- Score contribution (0-30 points) ---
    score = 30
    if needs_support:
        score -= 8
    if bed_adhesion_risk == "high":
        score -= 8
    elif bed_adhesion_risk == "moderate":
        score -= 4
    if warping_risk == "high":
        score -= 6
    elif warping_risk == "moderate":
        score -= 3
    if bridge_span_mm is not None and bridge_span_mm > 50:
        score -= 5
    if not printer_compatibility:
        score -= 10
    score = max(0, score)

    return HeuristicResult(
        overhang_face_ratio=overhang_face_ratio,
        needs_support=needs_support,
        support_volume_estimate_cm3=support_volume_estimate_cm3,
        bed_adhesion_risk=bed_adhesion_risk,
        warping_risk=warping_risk,
        bridge_span_mm=bridge_span_mm,
        printer_compatibility=printer_compatibility,
        recommendations=recommendations,
        issues=issues,
        score_contribution=score,
    )
