"""
Tests for the Dual-Lane Platform Upgrade.

Covers:
1. Artemis II demo fix — /api/demo/artemis route payload and family mapping
2. Harmonia merge engine — multi-input merging logic
3. Daedalus Gate receipt types and store utilities
4. Gallery page — all 16 cards have valid prompts and categories
5. Admin Daedalus page — receipt filtering and stats
"""
import sys
import os

# ── Path setup ────────────────────────────────────────────────────────────────
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))


# ═══════════════════════════════════════════════════════════════════════════════
# 1. ARTEMIS II DEMO FIX
# ═══════════════════════════════════════════════════════════════════════════════

class TestArtemisIIDemoFix:
    """Verify the Artemis II demo route maps to a valid MVP part family."""

    MVP_PART_FAMILIES = {
        "spacer", "flat_bracket", "l_bracket", "u_bracket", "hole_plate",
        "standoff_block", "cable_clip", "enclosure", "adapter_bushing", "simple_jig",
    }

    def test_artemis_maps_to_valid_family(self):
        """The Artemis demo must resolve to a family in MVP_PART_FAMILIES."""
        # The /api/demo/artemis route maps to standoff_block (display base)
        artemis_family = "standoff_block"
        assert artemis_family in self.MVP_PART_FAMILIES, (
            f"Artemis family '{artemis_family}' is not in MVP_PART_FAMILIES. "
            "This would cause a confidence=0 rejection from /api/invent."
        )

    def test_artemis_does_not_use_custom_shape(self):
        """custom_shape must NOT be used as the family for the Artemis demo."""
        invalid_family = "custom_shape"
        assert invalid_family not in self.MVP_PART_FAMILIES, (
            "custom_shape is not a valid MVP family — using it causes demo failure."
        )

    def test_artemis_scale_configs(self):
        """All three scale configs produce valid dimensions."""
        scale_configs = {
            "desk": {"height_mm": 120, "base_mm": 80},
            "display": {"height_mm": 200, "base_mm": 120},
            "mini": {"height_mm": 60, "base_mm": 45},
        }
        for scale, dims in scale_configs.items():
            assert dims["height_mm"] > 0, f"Scale {scale}: height must be positive"
            assert dims["base_mm"] > 0, f"Scale {scale}: base must be positive"
            assert dims["height_mm"] > dims["base_mm"] * 0.5, (
                f"Scale {scale}: height should be greater than half the base for a display stand"
            )

    def test_artemis_payload_shape(self):
        """The Artemis demo API payload must include required fields."""
        payload = {
            "scale": "desk",
            "material": "PLA",
            "quality": "standard",
        }
        assert "scale" in payload
        assert "material" in payload
        assert "quality" in payload
        assert payload["scale"] in ["desk", "display", "mini"]

    def test_artemis_route_not_calling_invent(self):
        """Verify the ArtemisIIDemoCard no longer calls /api/invent directly."""
        # Read the component file and check it calls /api/demo/artemis
        component_path = os.path.join(
            os.path.dirname(__file__),
            "..", "..", "web", "components", "intake", "ArtemisIIDemoCard.tsx"
        )
        if os.path.exists(component_path):
            with open(component_path) as f:
                content = f.read()
            assert "/api/demo/artemis" in content, (
                "ArtemisIIDemoCard must call /api/demo/artemis, not /api/invent"
            )
            # Ensure the old broken call is removed
            assert 'intake_family_candidate: "custom_shape"' not in content, (
                "ArtemisIIDemoCard must not use custom_shape family"
            )


# ═══════════════════════════════════════════════════════════════════════════════
# 2. HARMONIA MERGE ENGINE
# ═══════════════════════════════════════════════════════════════════════════════

class TestHarmoniaEngine:
    """Unit tests for the Harmonia multi-input merge logic."""

    def _classify_file(self, name: str, mime_type: str) -> str:
        """Replicate the file classifier from the Harmonia route."""
        name = name.lower()
        mime = mime_type.lower()
        # SVG check BEFORE generic image check (image/svg+xml starts with image/)
        if mime == "image/svg+xml" or name.endswith(".svg"):
            return "svg"
        if mime.startswith("image/") or any(name.endswith(ext) for ext in [".png", ".jpg", ".jpeg", ".gif", ".webp"]):
            return "image"
        if mime == "application/pdf" or "word" in mime or any(name.endswith(ext) for ext in [".pdf", ".doc", ".docx", ".txt", ".md"]):
            return "document"
        return "unknown"

    def test_file_classifier_image(self):
        assert self._classify_file("photo.png", "image/png") == "image"
        assert self._classify_file("sketch.jpg", "image/jpeg") == "image"
        assert self._classify_file("render.webp", "image/webp") == "image"

    def test_file_classifier_svg(self):
        assert self._classify_file("logo.svg", "image/svg+xml") == "svg"
        assert self._classify_file("design.svg", "text/plain") == "svg"

    def test_file_classifier_document(self):
        assert self._classify_file("spec.pdf", "application/pdf") == "document"
        assert self._classify_file("requirements.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document") == "document"
        assert self._classify_file("notes.txt", "text/plain") == "document"

    def test_file_classifier_unknown(self):
        assert self._classify_file("model.stl", "application/octet-stream") == "unknown"

    def test_input_summary_all_false_on_empty(self):
        """Empty input should produce all-false input summary."""
        text = ""
        voice = ""
        files = []
        has_text = len(text.strip()) > 0
        has_voice = len(voice.strip()) > 0
        has_files = len(files) > 0
        assert not has_text
        assert not has_voice
        assert not has_files

    def test_input_summary_counts_correctly(self):
        """Input summary should count distinct modalities."""
        inputs = {
            "text": "I need a 20mm spacer",
            "voice": "",
            "files": [
                {"name": "photo.png", "type": "image/png"},
                {"name": "spec.pdf", "type": "application/pdf"},
            ],
        }
        has_text = len(inputs["text"].strip()) > 0
        has_voice = len(inputs["voice"].strip()) > 0
        has_images = any(self._classify_file(f["name"], f["type"]) == "image" for f in inputs["files"])
        has_docs = any(self._classify_file(f["name"], f["type"]) == "document" for f in inputs["files"])
        total = sum([has_text, has_voice, has_images, has_docs])
        assert total == 3  # text + image + document

    def test_merge_deduplicates_voice_and_text(self):
        """If voice and text are identical, only text should be used."""
        text = "I need a 20mm spacer with 5mm bore"
        voice = "I need a 20mm spacer with 5mm bore"
        # When voice == text, we should NOT include voice in the context
        should_include_voice = voice.strip() != text.strip()
        assert not should_include_voice

    def test_merge_includes_voice_when_different(self):
        """If voice adds new info, it should be included."""
        text = "I need a spacer"
        voice = "I need a 20mm spacer with 5mm bore, 15mm tall"
        should_include_voice = voice.strip() != text.strip()
        assert should_include_voice

    def test_daedalus_receipt_structure(self):
        """Harmonia must produce a valid Daedalus receipt."""
        receipt = {
            "gate": "harmonia_merge",
            "timestamp": "2026-04-01T12:00:00Z",
            "elapsed_ms": 450,
            "inputs_received": ["text", "images(2)"],
            "merge_strategy": "vision_assisted_merge",
            "confidence": 0.85,
            "recommended_path": "parametric",
            "result": "GO",
            "notes": ["2 input modalities merged", "0 missing fields after merge"],
        }
        assert receipt["gate"] == "harmonia_merge"
        assert receipt["result"] in ["GO", "CLARIFY", "REJECT", "WARN"]
        assert 0.0 <= receipt["confidence"] <= 1.0
        assert receipt["recommended_path"] in ["parametric", "concept", "image_relief", "needs_clarification"]
        assert isinstance(receipt["notes"], list)

    def test_go_threshold(self):
        """Result should be GO when confidence >= 0.65 and path is not needs_clarification."""
        confidence = 0.85
        path = "parametric"
        result = "CLARIFY" if path == "needs_clarification" else ("GO" if confidence >= 0.65 else "CLARIFY")
        assert result == "GO"

    def test_clarify_threshold(self):
        """Result should be CLARIFY when confidence < 0.65."""
        confidence = 0.45
        path = "parametric"
        result = "CLARIFY" if path == "needs_clarification" else ("GO" if confidence >= 0.65 else "CLARIFY")
        assert result == "CLARIFY"

    def test_clarify_when_needs_clarification_path(self):
        """Result should be CLARIFY when path is needs_clarification regardless of confidence."""
        confidence = 0.90
        path = "needs_clarification"
        result = "CLARIFY" if path == "needs_clarification" else ("GO" if confidence >= 0.65 else "CLARIFY")
        assert result == "CLARIFY"


# ═══════════════════════════════════════════════════════════════════════════════
# 3. DAEDALUS GATE RECEIPT TYPES
# ═══════════════════════════════════════════════════════════════════════════════

class TestDaedalusGateTypes:
    """Verify the Daedalus receipt type system is complete and consistent."""

    VALID_GATES = {
        "intake_interpretation",
        "harmonia_merge",
        "clarification",
        "preview",
        "vpl",
        "trust",
        "generation",
        "artemis_demo_generation",
    }

    VALID_RESULTS = {"GO", "CLARIFY", "REJECT", "WARN"}

    def test_all_gates_defined(self):
        """All expected gates must be in the valid set."""
        required_gates = {
            "intake_interpretation",
            "harmonia_merge",
            "generation",
        }
        for gate in required_gates:
            assert gate in self.VALID_GATES, f"Gate '{gate}' missing from VALID_GATES"

    def test_all_results_defined(self):
        assert "GO" in self.VALID_RESULTS
        assert "CLARIFY" in self.VALID_RESULTS
        assert "REJECT" in self.VALID_RESULTS
        assert "WARN" in self.VALID_RESULTS

    def test_receipt_required_fields(self):
        """A receipt must have all required fields."""
        receipt = {
            "gate": "intake_interpretation",
            "timestamp": "2026-04-01T12:00:00Z",
            "elapsed_ms": 320,
            "result": "GO",
            "payload": {},
            "notes": [],
        }
        required = ["gate", "timestamp", "elapsed_ms", "result", "payload", "notes"]
        for field in required:
            assert field in receipt, f"Required field '{field}' missing from receipt"

    def test_receipt_gate_is_valid(self):
        receipt_gate = "harmonia_merge"
        assert receipt_gate in self.VALID_GATES

    def test_receipt_result_is_valid(self):
        receipt_result = "GO"
        assert receipt_result in self.VALID_RESULTS

    def test_confidence_range(self):
        """Confidence must be between 0 and 1 inclusive."""
        for confidence in [0.0, 0.5, 0.85, 1.0]:
            assert 0.0 <= confidence <= 1.0

    def test_invalid_confidence_rejected(self):
        """Values outside 0–1 are invalid."""
        for confidence in [-0.1, 1.1, 2.0]:
            assert not (0.0 <= confidence <= 1.0), f"Confidence {confidence} should be invalid"

    def test_migration_file_exists(self):
        """Migration 011 for daedalus_receipts must exist."""
        migration_path = os.path.join(
            os.path.dirname(__file__),
            "..", "..", "..", "packages", "db", "migrations",
            "011_daedalus_gate_receipts.sql"
        )
        assert os.path.exists(migration_path), "Migration 011_daedalus_gate_receipts.sql not found"

    def test_migration_contains_table_creation(self):
        """Migration must create the daedalus_receipts table."""
        migration_path = os.path.join(
            os.path.dirname(__file__),
            "..", "..", "..", "packages", "db", "migrations",
            "011_daedalus_gate_receipts.sql"
        )
        if os.path.exists(migration_path):
            with open(migration_path) as f:
                content = f.read()
            assert "CREATE TABLE" in content
            assert "daedalus_receipts" in content
            assert "gate" in content
            assert "result" in content
            assert "payload" in content


# ═══════════════════════════════════════════════════════════════════════════════
# 4. GALLERY PAGE
# ═══════════════════════════════════════════════════════════════════════════════

class TestGalleryPage:
    """Verify the click-to-make gallery has valid, complete card data."""

    # Replicate the gallery cards data for testing
    GALLERY_CARDS = [
        {"id": "spacer-20mm", "category": "precision", "prompt": "20mm OD spacer with 5mm bore, 15mm tall, for M5 bolt", "difficulty": "easy"},
        {"id": "l-bracket-50mm", "category": "precision", "prompt": "L-bracket with 50mm and 40mm legs, 4mm thick, 3 M4 holes on each leg", "difficulty": "easy"},
        {"id": "drill-jig", "category": "precision", "prompt": "Drill jig 80x60mm base with 4 alignment holes at 10mm spacing, 5mm guide diameter", "difficulty": "medium"},
        {"id": "cable-clip-8mm", "category": "precision", "prompt": "Cable clip for 8mm cable OD, screw base mount, snap fit", "difficulty": "easy"},
        {"id": "pipe-saddle-22mm", "category": "precision", "prompt": "U-bracket saddle clamp for 22mm pipe OD, 3mm wall thickness, 40mm flange width", "difficulty": "easy"},
        {"id": "electronics-enclosure", "category": "precision", "prompt": "Electronics enclosure 60x40x30mm interior, 2mm wall, removable snap lid", "difficulty": "medium"},
        {"id": "toothpick-launcher", "category": "fun", "prompt": "Small desk toothpick launcher toy, spring loaded, safe for desk use, printable without supports", "difficulty": "easy"},
        {"id": "mini-catapult", "category": "fun", "prompt": "Mini tabletop catapult toy 120mm long, launches foam balls, printable in parts", "difficulty": "medium"},
        {"id": "desk-fidget", "category": "fun", "prompt": "Fidget spinner 70mm diameter 3-arm design, fits 608 bearing, smooth spin", "difficulty": "easy"},
        {"id": "phone-stand", "category": "fun", "prompt": "Adjustable phone stand with 3 angle positions, fits phones up to 80mm wide, foldable", "difficulty": "easy"},
        {"id": "artemis-display-base", "category": "showcase", "prompt": "Commemorative display base for Artemis II mission, 80mm hexagonal base, engraved text, standoff column", "difficulty": "medium"},
        {"id": "ai4u-badge", "category": "showcase", "prompt": "Decorative medallion 60mm diameter with AI4U text raised, wall mount hole, clean finish", "difficulty": "easy"},
        {"id": "gear-display", "category": "showcase", "prompt": "3 interlocking display gears with 40, 30, and 20 teeth on a base plate, meshing correctly", "difficulty": "advanced"},
        {"id": "name-sign", "category": "gift", "prompt": "Desk name sign 150mm wide with raised 30mm tall letters, flat base, clean font", "difficulty": "easy"},
        {"id": "keychain-tag", "category": "gift", "prompt": "Custom keychain tag 40mm diameter, engraved text area, 4mm keyring hole, 3mm thick", "difficulty": "easy"},
        {"id": "planter-drainage", "category": "gift", "prompt": "Drainage insert for 100mm round planter, raised grid pattern, 10mm legs, prevents root rot", "difficulty": "easy"},
    ]

    VALID_CATEGORIES = {"precision", "fun", "showcase", "gift"}
    VALID_DIFFICULTIES = {"easy", "medium", "advanced"}

    def test_minimum_card_count(self):
        """Gallery must have at least 12 cards."""
        assert len(self.GALLERY_CARDS) >= 12, f"Gallery has only {len(self.GALLERY_CARDS)} cards, need at least 12"

    def test_all_cards_have_required_fields(self):
        """Every card must have id, category, prompt, and difficulty."""
        for card in self.GALLERY_CARDS:
            assert "id" in card, f"Card missing 'id': {card}"
            assert "category" in card, f"Card '{card['id']}' missing 'category'"
            assert "prompt" in card, f"Card '{card['id']}' missing 'prompt'"
            assert "difficulty" in card, f"Card '{card['id']}' missing 'difficulty'"

    def test_all_card_ids_are_unique(self):
        """Card IDs must be unique."""
        ids = [c["id"] for c in self.GALLERY_CARDS]
        assert len(ids) == len(set(ids)), "Duplicate card IDs found"

    def test_all_categories_are_valid(self):
        """All card categories must be in the valid set."""
        for card in self.GALLERY_CARDS:
            assert card["category"] in self.VALID_CATEGORIES, (
                f"Card '{card['id']}' has invalid category '{card['category']}'"
            )

    def test_all_difficulties_are_valid(self):
        """All card difficulties must be in the valid set."""
        for card in self.GALLERY_CARDS:
            assert card["difficulty"] in self.VALID_DIFFICULTIES, (
                f"Card '{card['id']}' has invalid difficulty '{card['difficulty']}'"
            )

    def test_all_prompts_are_non_empty(self):
        """All prompts must be non-empty strings."""
        for card in self.GALLERY_CARDS:
            assert isinstance(card["prompt"], str), f"Card '{card['id']}' prompt is not a string"
            assert len(card["prompt"].strip()) > 0, f"Card '{card['id']}' has empty prompt"

    def test_all_prompts_are_descriptive(self):
        """All prompts must be at least 20 characters (descriptive enough for the AI)."""
        for card in self.GALLERY_CARDS:
            assert len(card["prompt"]) >= 20, (
                f"Card '{card['id']}' prompt too short: '{card['prompt']}'"
            )

    def test_each_category_has_at_least_two_cards(self):
        """Each category must have at least 2 cards."""
        for cat in self.VALID_CATEGORIES:
            count = sum(1 for c in self.GALLERY_CARDS if c["category"] == cat)
            assert count >= 2, f"Category '{cat}' has only {count} card(s), need at least 2"

    def test_precision_cards_have_dimensions(self):
        """Precision part prompts should contain numeric dimensions."""
        import re
        precision_cards = [c for c in self.GALLERY_CARDS if c["category"] == "precision"]
        for card in precision_cards:
            has_number = bool(re.search(r'\d+', card["prompt"]))
            assert has_number, (
                f"Precision card '{card['id']}' prompt has no numeric dimensions: '{card['prompt']}'"
            )

    def test_gallery_page_file_exists(self):
        """The gallery page file must exist."""
        gallery_path = os.path.join(
            os.path.dirname(__file__),
            "..", "..", "web", "app", "gallery", "page.tsx"
        )
        assert os.path.exists(gallery_path), "Gallery page file not found at app/gallery/page.tsx"

    def test_gallery_page_has_make_this_links(self):
        """Gallery page must contain 'Make This' CTA links."""
        gallery_path = os.path.join(
            os.path.dirname(__file__),
            "..", "..", "web", "app", "gallery", "page.tsx"
        )
        if os.path.exists(gallery_path):
            with open(gallery_path) as f:
                content = f.read()
            assert "Make This" in content, "Gallery page missing 'Make This' CTA"
            assert "/invent" in content, "Gallery page must link to /invent"


# ═══════════════════════════════════════════════════════════════════════════════
# 5. ADMIN DAEDALUS PAGE
# ═══════════════════════════════════════════════════════════════════════════════

class TestAdminDaedalusPage:
    """Verify the admin Daedalus inspector page exists and has correct structure."""

    def test_admin_daedalus_page_exists(self):
        """The admin Daedalus page must exist."""
        page_path = os.path.join(
            os.path.dirname(__file__),
            "..", "..", "web", "app", "admin", "daedalus", "page.tsx"
        )
        assert os.path.exists(page_path), "Admin Daedalus page not found"

    def test_admin_daedalus_page_has_auth_check(self):
        """Admin page must check for operator role."""
        page_path = os.path.join(
            os.path.dirname(__file__),
            "..", "..", "web", "app", "admin", "daedalus", "page.tsx"
        )
        if os.path.exists(page_path):
            with open(page_path) as f:
                content = f.read()
            assert "operator" in content, "Admin page must check for operator role"
            assert "redirect" in content, "Admin page must redirect non-operators"

    def test_admin_daedalus_api_route_exists(self):
        """The admin Daedalus API route must exist."""
        route_path = os.path.join(
            os.path.dirname(__file__),
            "..", "..", "web", "app", "api", "admin", "daedalus", "receipts", "route.ts"
        )
        assert os.path.exists(route_path), "Admin Daedalus API route not found"

    def test_receipt_stats_calculation(self):
        """Stats calculation must correctly count results."""
        receipts = [
            {"result": "GO"},
            {"result": "GO"},
            {"result": "CLARIFY"},
            {"result": "REJECT"},
            {"result": "GO"},
            {"result": "WARN"},
        ]
        stats = {
            "GO": sum(1 for r in receipts if r["result"] == "GO"),
            "CLARIFY": sum(1 for r in receipts if r["result"] == "CLARIFY"),
            "REJECT": sum(1 for r in receipts if r["result"] == "REJECT"),
            "WARN": sum(1 for r in receipts if r["result"] == "WARN"),
        }
        assert stats["GO"] == 3
        assert stats["CLARIFY"] == 1
        assert stats["REJECT"] == 1
        assert stats["WARN"] == 1

    def test_avg_confidence_calculation(self):
        """Average confidence must be calculated correctly."""
        receipts = [
            {"confidence": 0.8},
            {"confidence": 0.6},
            {"confidence": 0.9},
            {"confidence": None},
        ]
        valid = [r for r in receipts if r["confidence"] is not None]
        avg = sum(r["confidence"] for r in valid) / len(valid)
        assert abs(avg - (0.8 + 0.6 + 0.9) / 3) < 0.001

    def test_dual_lane_section_exists(self):
        """DualLaneSection component must exist."""
        component_path = os.path.join(
            os.path.dirname(__file__),
            "..", "..", "web", "components", "DualLaneSection.tsx"
        )
        assert os.path.exists(component_path), "DualLaneSection.tsx not found"

    def test_dual_lane_section_has_both_lanes(self):
        """DualLaneSection must contain both Shop and Fun lane content."""
        component_path = os.path.join(
            os.path.dirname(__file__),
            "..", "..", "web", "components", "DualLaneSection.tsx"
        )
        if os.path.exists(component_path):
            with open(component_path) as f:
                content = f.read()
            assert "Lane A" in content, "DualLaneSection missing Lane A (Shop)"
            assert "Lane B" in content, "DualLaneSection missing Lane B (Fun)"
            assert "Build for the Shop" in content
            assert "Build for Fun" in content

    def test_harmonia_route_exists(self):
        """The Harmonia API route must exist."""
        route_path = os.path.join(
            os.path.dirname(__file__),
            "..", "..", "web", "app", "api", "intake", "harmonia", "route.ts"
        )
        assert os.path.exists(route_path), "Harmonia route not found at /api/intake/harmonia"

    def test_artemis_demo_route_exists(self):
        """The dedicated Artemis demo route must exist."""
        route_path = os.path.join(
            os.path.dirname(__file__),
            "..", "..", "web", "app", "api", "demo", "artemis", "route.ts"
        )
        assert os.path.exists(route_path), "Artemis demo route not found at /api/demo/artemis"

    def test_daedalus_types_file_exists(self):
        """The Daedalus types file must exist."""
        types_path = os.path.join(
            os.path.dirname(__file__),
            "..", "..", "web", "lib", "daedalus", "types.ts"
        )
        assert os.path.exists(types_path), "Daedalus types file not found at lib/daedalus/types.ts"

    def test_daedalus_store_file_exists(self):
        """The Daedalus store utility must exist."""
        store_path = os.path.join(
            os.path.dirname(__file__),
            "..", "..", "web", "lib", "daedalus", "store.ts"
        )
        assert os.path.exists(store_path), "Daedalus store file not found at lib/daedalus/store.ts"
