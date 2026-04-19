"""
VPL Geometry Validator
======================
Uses trimesh to validate STL geometry for printability.
Checks: watertight/manifold, volume, bounding box, wall thickness proxy,
face count, and non-manifold edges.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

import trimesh


@dataclass
class GeometryResult:
    is_watertight: bool
    is_manifold: bool
    volume_cm3: float
    bounding_box_mm: dict          # {x, y, z}
    face_count: int
    vertex_count: int
    non_manifold_edges: int
    min_wall_thickness_mm: Optional[float]  # heuristic proxy
    issues: list[str] = field(default_factory=list)
    score_contribution: int = 0    # 0-30 points

    def to_dict(self) -> dict:
        return {
            "is_watertight": self.is_watertight,
            "is_manifold": self.is_manifold,
            "volume_cm3": round(self.volume_cm3, 4),
            "bounding_box_mm": self.bounding_box_mm,
            "face_count": self.face_count,
            "vertex_count": self.vertex_count,
            "non_manifold_edges": self.non_manifold_edges,
            "min_wall_thickness_mm": self.min_wall_thickness_mm,
            "issues": self.issues,
            "score_contribution": self.score_contribution,
        }


def validate_geometry(stl_path: str) -> GeometryResult:
    """Load an STL and run geometry validation checks."""
    mesh = trimesh.load_mesh(stl_path, force="mesh")

    issues: list[str] = []

    # --- Watertight / manifold ---
    is_watertight = bool(mesh.is_watertight)
    is_manifold = bool(mesh.is_volume)
    non_manifold_edges = int(len(mesh.as_open_as_possible().edges_unique) - len(mesh.edges_unique)) if not is_watertight else 0

    if not is_watertight:
        issues.append("Mesh is not watertight — may cause slicer errors")
    if not is_manifold:
        issues.append("Mesh is not manifold — non-printable geometry detected")

    # --- Volume ---
    volume_cm3 = float(abs(mesh.volume) / 1000.0)  # mm³ → cm³
    if volume_cm3 < 0.01:
        issues.append(f"Volume too small ({volume_cm3:.4f} cm³) — may not print correctly")

    # --- Bounding box ---
    extents = mesh.extents  # [x, y, z] in mm
    bbox = {"x": round(float(extents[0]), 2), "y": round(float(extents[1]), 2), "z": round(float(extents[2]), 2)}

    # Check if fits in standard Ender3 build volume (220×220×250mm)
    if extents[0] > 220 or extents[1] > 220:
        issues.append(f"Part exceeds Ender3 XY build volume ({bbox['x']}×{bbox['y']}mm > 220×220mm)")
    if extents[2] > 250:
        issues.append(f"Part exceeds Ender3 Z build volume ({bbox['z']}mm > 250mm)")

    # --- Wall thickness proxy ---
    # Use the smallest bounding box dimension as a proxy for minimum wall thickness
    min_dim = float(min(extents))
    min_wall_thickness_mm = round(min_dim, 2)
    if min_wall_thickness_mm < 0.8:
        issues.append(f"Minimum dimension {min_wall_thickness_mm}mm is below 0.8mm minimum wall thickness")

    # --- Face count ---
    face_count = int(len(mesh.faces))
    vertex_count = int(len(mesh.vertices))
    if face_count > 500_000:
        issues.append(f"High face count ({face_count:,}) — consider mesh simplification for faster slicing")

    # --- Score contribution (0-30 points) ---
    score = 30
    if not is_watertight:
        score -= 15
    if not is_manifold:
        score -= 10
    if min_wall_thickness_mm < 0.8:
        score -= 10
    elif min_wall_thickness_mm < 1.2:
        score -= 5
    if extents[0] > 220 or extents[1] > 220 or extents[2] > 250:
        score -= 5
    score = max(0, score)

    return GeometryResult(
        is_watertight=is_watertight,
        is_manifold=is_manifold,
        volume_cm3=volume_cm3,
        bounding_box_mm=bbox,
        face_count=face_count,
        vertex_count=vertex_count,
        non_manifold_edges=non_manifold_edges,
        min_wall_thickness_mm=min_wall_thickness_mm,
        issues=issues,
        score_contribution=score,
    )
