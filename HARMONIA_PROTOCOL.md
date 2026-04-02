# Harmonia Multi-Input Protocol

The **Harmonia Merge Engine** (`/api/intake/harmonia`) is the unified brain of the AI4U Little Engineer intake process. It resolves the complexity of receiving multiple, potentially conflicting inputs from a user simultaneously.

## The Problem

A user might:
1. Upload a photo of a broken bracket.
2. Say "I need a replacement for this, but make it 5mm thicker."
3. Type "Hole spacing is 40mm."
4. Upload a PDF spec sheet.

Previously, the system could only handle one input type at a time.

## The Harmonia Solution

Harmonia takes all these inputs, classifies them, and merges them into a single, canonical `unified_request` using a large language model (LLM) with vision capabilities.

### Input Modalities Handled

- **Text**: Typed descriptions.
- **Voice**: Transcribed speech.
- **Images**: Photos, sketches, renders (base64 data URLs).
- **Documents**: PDFs, Word docs, text files.
- **SVGs**: Vector graphics.
- **Prior Session State**: Context from previous interactions in the same session.

### Merge Rules (Enforced by System Prompt)

1. **Deduplication**: If voice and text are identical, use text.
2. **Conflict Resolution**: Prefer explicit dimensions over inferred ones.
3. **Information Extraction**: Extract dimensions from images and documents so the user isn't asked for them again.
4. **Context Preservation**: Remember what was already answered in prior session states.
5. **Unified Output**: Produce a single, clear, actionable description.

### Output Contract (`HarmoniaResult`)

- `unified_request`: The merged description.
- `confidence`: 0.0 to 1.0 score.
- `missing_information`: Array of truly missing, required fields.
- `recommended_path`: "parametric", "concept", "image_relief", or "needs_clarification".
- `mode`: The specific interpretation mode.
- `family_candidate`: The matched parametric family (if applicable).
- `extracted_dimensions`: Key-value pairs of dimensions in mm.
- `assistant_message`: A friendly, jargon-free response.
- `daedalus_receipt`: The structured proof receipt for this gate.
- `session_id`: The intake session identifier.

© AI4U, LLC. AI4Utech.com, Lee Hanna-Owner.
