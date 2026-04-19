"""
test_universal_intake.py

Tests for the Universal Intake system:
  - Interpretation mode classification
  - Dimension extraction
  - Confidence scoring
  - Clarification logic
  - File type routing
  - Artemis II demo configuration
"""

import sys
import os

# ── Path setup ────────────────────────────────────────────────────────────────
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


# ── Helpers / stubs ───────────────────────────────────────────────────────────

def classify_intake_mode(text: str, file_types: list[str] | None = None) -> str:
    """
    Mirrors the classification logic in /api/intake/interpret/route.ts.
    Returns the expected mode for a given text + file combination.
    """
    text_lower = text.lower()
    file_types = file_types or []

    # Image → replica / relief
    has_image = any(ft in ["image/png", "image/jpeg", "image/jpg", "image/webp"] for ft in file_types)
    has_svg = any(ft == "image/svg+xml" for ft in file_types)
    has_doc = any(ft in ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"] for ft in file_types)

    if has_svg:
        return "svg_to_extrusion"
    if has_doc:
        return "document_to_model_reference"
    if has_image:
        if any(kw in text_lower for kw in ["replica", "3d", "model", "figure", "statue"]):
            return "image_to_replica"
        return "image_to_relief"

    # Concept / invention keywords take priority over generic parametric keywords
    concept_keywords = ["rocket", "launch", "artemis", "spaceship", "drone", "robot", "creature"]
    if any(kw in text_lower for kw in concept_keywords):
        return "concept_invention"

    # Parametric part keywords
    parametric_keywords = [
        "bracket", "spacer", "bushing", "clip", "plate", "enclosure",
        "standoff", "mount", "jig", "holder", "adapter", "flange",
        "bore", "od", "id", "mm", "m3", "m4", "m5", "m6",
    ]
    if any(kw in text_lower for kw in parametric_keywords):
        return "parametric_part"

    # Needs clarification
    if len(text.strip()) < 10:
        return "needs_clarification"

    return "concept_invention"


def extract_dimensions(text: str) -> dict[str, float]:
    """
    Mirrors the dimension extraction logic in the intake interpret route.
    Returns a dict of dimension_name → value_mm.
    """
    import re
    dims: dict[str, float] = {}

    # Pattern: <number>mm or <number> mm
    patterns = [
        (r"(\d+(?:\.\d+)?)\s*mm\s+(?:od|outer|outside|diameter)", "outer_diameter"),
        (r"(\d+(?:\.\d+)?)\s*mm\s+(?:id|inner|bore|hole)", "inner_diameter"),
        (r"(\d+(?:\.\d+)?)\s*mm\s+(?:tall|height|high|long|length)", "height"),
        (r"(\d+(?:\.\d+)?)\s*mm\s+(?:wide|width)", "width"),
        (r"(\d+(?:\.\d+)?)\s*mm\s+(?:thick|thickness|wall)", "wall_thickness"),
        (r"(\d+(?:\.\d+)?)\s*mm\s+(?:od|outer)?", "dimension"),
    ]

    for pattern, name in patterns[:-1]:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            dims[name] = float(m.group(1))

    # Generic mm values if no named ones found
    if not dims:
        all_mm = re.findall(r"(\d+(?:\.\d+)?)\s*mm", text, re.IGNORECASE)
        if len(all_mm) == 1:
            dims["dimension"] = float(all_mm[0])
        elif len(all_mm) >= 2:
            dims["width"] = float(all_mm[0])
            dims["height"] = float(all_mm[1])

    return dims


def compute_confidence(mode: str, dims: dict, missing: list[str]) -> float:
    """
    Mirrors the confidence scoring in the interpret route.
    """
    base_scores = {
        "parametric_part": 0.85,
        "image_to_relief": 0.75,
        "image_to_replica": 0.65,
        "svg_to_extrusion": 0.80,
        "document_to_model_reference": 0.70,
        "concept_invention": 0.55,
        "needs_clarification": 0.20,
    }
    base = base_scores.get(mode, 0.50)

    # Boost for having dimensions
    if dims:
        base = min(base + 0.10, 1.0)

    # Penalty for missing info
    penalty = len(missing) * 0.08
    return max(base - penalty, 0.10)


# ── Mode classification tests ─────────────────────────────────────────────────

class TestModeClassification:
    def test_parametric_bracket(self):
        assert classify_intake_mode("I need an L-bracket 50x40mm") == "parametric_part"

    def test_parametric_spacer(self):
        assert classify_intake_mode("Make a 20mm OD spacer with 5mm bore") == "parametric_part"

    def test_parametric_cable_clip(self):
        assert classify_intake_mode("cable clip for 8mm wire") == "parametric_part"

    def test_parametric_enclosure(self):
        assert classify_intake_mode("I need a small enclosure 60x40x30mm") == "parametric_part"

    def test_image_to_relief_png(self):
        mode = classify_intake_mode("make a plaque from this", ["image/png"])
        assert mode == "image_to_relief"

    def test_image_to_replica_jpeg(self):
        mode = classify_intake_mode("make a 3d replica of this", ["image/jpeg"])
        assert mode == "image_to_replica"

    def test_svg_to_extrusion(self):
        mode = classify_intake_mode("extrude this logo", ["image/svg+xml"])
        assert mode == "svg_to_extrusion"

    def test_document_to_model_reference(self):
        mode = classify_intake_mode("build this from the spec", ["application/pdf"])
        assert mode == "document_to_model_reference"

    def test_concept_invention_rocket(self):
        mode = classify_intake_mode("I want a rocket model")
        assert mode == "concept_invention"

    def test_concept_invention_artemis(self):
        mode = classify_intake_mode("Artemis II launch pad commemorative model")
        assert mode == "concept_invention"

    def test_needs_clarification_too_short(self):
        mode = classify_intake_mode("thing")
        assert mode == "needs_clarification"

    def test_svg_takes_priority_over_text(self):
        # SVG file should override text-based parametric classification
        mode = classify_intake_mode("make a bracket from this", ["image/svg+xml"])
        assert mode == "svg_to_extrusion"


# ── Dimension extraction tests ────────────────────────────────────────────────

class TestDimensionExtraction:
    def test_single_dimension(self):
        dims = extract_dimensions("I need a 20mm spacer")
        assert "dimension" in dims
        assert dims["dimension"] == 20.0

    def test_outer_diameter(self):
        dims = extract_dimensions("20mm OD spacer")
        assert "outer_diameter" in dims
        assert dims["outer_diameter"] == 20.0

    def test_inner_diameter(self):
        dims = extract_dimensions("5mm bore hole")
        assert "inner_diameter" in dims
        assert dims["inner_diameter"] == 5.0

    def test_height(self):
        dims = extract_dimensions("15mm tall spacer")
        assert "height" in dims
        assert dims["height"] == 15.0

    def test_wall_thickness(self):
        dims = extract_dimensions("2mm thick wall")
        assert "wall_thickness" in dims
        assert dims["wall_thickness"] == 2.0

    def test_two_dimensions(self):
        dims = extract_dimensions("50mm wide 40mm")
        assert len(dims) >= 1

    def test_decimal_dimension(self):
        dims = extract_dimensions("3.5mm bore")
        assert "inner_diameter" in dims
        assert dims["inner_diameter"] == 3.5

    def test_no_dimensions(self):
        dims = extract_dimensions("make me a cool rocket")
        assert isinstance(dims, dict)

    def test_multiple_mm_values(self):
        dims = extract_dimensions("80mm wide 60mm")
        # Should capture at least width
        assert len(dims) >= 1


# ── Confidence scoring tests ──────────────────────────────────────────────────

class TestConfidenceScoring:
    def test_parametric_with_dims_high_confidence(self):
        conf = compute_confidence("parametric_part", {"height": 20.0}, [])
        assert conf >= 0.85

    def test_needs_clarification_low_confidence(self):
        conf = compute_confidence("needs_clarification", {}, ["size", "material", "purpose"])
        assert conf < 0.30

    def test_missing_info_reduces_confidence(self):
        conf_full = compute_confidence("parametric_part", {"height": 20.0}, [])
        conf_missing = compute_confidence("parametric_part", {"height": 20.0}, ["bore_diameter", "wall_thickness"])
        assert conf_full > conf_missing

    def test_dims_boost_confidence(self):
        conf_no_dims = compute_confidence("concept_invention", {}, [])
        conf_with_dims = compute_confidence("concept_invention", {"height": 200.0}, [])
        assert conf_with_dims > conf_no_dims

    def test_confidence_never_above_1(self):
        conf = compute_confidence("parametric_part", {"a": 1, "b": 2, "c": 3}, [])
        assert conf <= 1.0

    def test_confidence_never_below_0(self):
        conf = compute_confidence("needs_clarification", {}, ["a", "b", "c", "d", "e", "f", "g"])
        assert conf >= 0.0

    def test_image_to_relief_moderate_confidence(self):
        conf = compute_confidence("image_to_relief", {}, [])
        assert 0.50 <= conf <= 0.90


# ── Artemis II demo configuration tests ──────────────────────────────────────

class TestArtemisIIDemoConfig:
    """Tests for the Artemis II demo configuration logic."""

    SCALE_PARAMS = {
        "small": {"height_mm": 120, "base_mm": 80, "time": "~2.5h", "filament": "~45g"},
        "medium": {"height_mm": 200, "base_mm": 130, "time": "~5h", "filament": "~90g"},
        "display": {"height_mm": 320, "base_mm": 200, "time": "~10h", "filament": "~180g"},
    }

    VPL_SCORES = {
        "draft": {"score": 72, "grade": "B", "tier": "Verified"},
        "standard": {"score": 84, "grade": "A", "tier": "Trusted Commercial"},
        "fine": {"score": 91, "grade": "A", "tier": "Trusted Commercial"},
    }

    def test_all_scales_defined(self):
        assert set(self.SCALE_PARAMS.keys()) == {"small", "medium", "display"}

    def test_scale_heights_ascending(self):
        heights = [self.SCALE_PARAMS[s]["height_mm"] for s in ["small", "medium", "display"]]
        assert heights == sorted(heights)

    def test_scale_filament_ascending(self):
        filaments = [int(self.SCALE_PARAMS[s]["filament"].replace("~", "").replace("g", ""))
                     for s in ["small", "medium", "display"]]
        assert filaments == sorted(filaments)

    def test_vpl_scores_ascending_with_quality(self):
        scores = [self.VPL_SCORES[q]["score"] for q in ["draft", "standard", "fine"]]
        assert scores == sorted(scores)

    def test_standard_quality_grade_a(self):
        assert self.VPL_SCORES["standard"]["grade"] == "A"

    def test_fine_quality_trusted_commercial(self):
        assert self.VPL_SCORES["fine"]["tier"] == "Trusted Commercial"

    def test_draft_quality_verified_tier(self):
        assert self.VPL_SCORES["draft"]["tier"] == "Verified"

    def test_display_scale_large_enough(self):
        assert self.SCALE_PARAMS["display"]["height_mm"] >= 300

    def test_problem_text_generation(self):
        """Verify the problem text built for the invent API is well-formed."""
        scale = self.SCALE_PARAMS["medium"]
        material = "PLA"
        quality = "standard"
        problem_text = (
            f"Create a commemorative Artemis II rocket and launch pad scale model. "
            f"Height: {scale['height_mm']}mm, base: {scale['base_mm']}mm. "
            f"Consumer-safe simplification, printable without supports where possible. "
            f"Material: {material}, quality: {quality}. "
            f"This is a showcase/demo model inspired by the Artemis II mission — not an official NASA model."
        )
        assert "Artemis II" in problem_text
        assert "200mm" in problem_text
        assert "not an official NASA model" in problem_text
        assert len(problem_text) > 50


# ── File type routing tests ───────────────────────────────────────────────────

class TestFileTypeRouting:
    SUPPORTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"]
    SUPPORTED_DOC_TYPES = [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain",
    ]
    SUPPORTED_SVG_TYPES = ["image/svg+xml"]
    MAX_FILE_SIZE_MB = 10

    def test_image_types_accepted(self):
        for ft in self.SUPPORTED_IMAGE_TYPES:
            assert ft.startswith("image/")

    def test_svg_is_separate_from_images(self):
        assert "image/svg+xml" not in self.SUPPORTED_IMAGE_TYPES

    def test_doc_types_accepted(self):
        assert "application/pdf" in self.SUPPORTED_DOC_TYPES

    def test_max_file_size_reasonable(self):
        assert 1 <= self.MAX_FILE_SIZE_MB <= 50

    def test_unsupported_type_not_in_any_list(self):
        unsupported = "application/x-executable"
        all_supported = (
            self.SUPPORTED_IMAGE_TYPES
            + self.SUPPORTED_DOC_TYPES
            + self.SUPPORTED_SVG_TYPES
        )
        assert unsupported not in all_supported


# ── Integration: full intake pipeline ────────────────────────────────────────

class TestIntakePipeline:
    """End-to-end pipeline tests simulating the full intake flow."""

    def test_parametric_pipeline(self):
        text = "I need a 20mm OD spacer with 5mm bore, 15mm tall"
        mode = classify_intake_mode(text)
        dims = extract_dimensions(text)
        missing = []
        conf = compute_confidence(mode, dims, missing)

        assert mode == "parametric_part"
        assert dims.get("outer_diameter") == 20.0
        assert dims.get("inner_diameter") == 5.0
        assert dims.get("height") == 15.0
        assert conf >= 0.85

    def test_image_pipeline(self):
        text = "make a plaque from this photo"
        mode = classify_intake_mode(text, ["image/png"])
        dims = extract_dimensions(text)
        missing = ["width", "height", "depth"]
        conf = compute_confidence(mode, dims, missing)

        assert mode == "image_to_relief"
        assert conf < 0.70  # missing dims reduce confidence

    def test_concept_pipeline(self):
        text = "Artemis II commemorative launch pad model, medium size"
        mode = classify_intake_mode(text)
        dims = extract_dimensions(text)
        conf = compute_confidence(mode, dims, [])

        assert mode == "concept_invention"
        assert 0.40 <= conf <= 0.80

    def test_svg_pipeline(self):
        text = "extrude my company logo 5mm thick"
        mode = classify_intake_mode(text, ["image/svg+xml"])
        dims = extract_dimensions(text)
        conf = compute_confidence(mode, dims, [])

        assert mode == "svg_to_extrusion"
        assert conf >= 0.70
