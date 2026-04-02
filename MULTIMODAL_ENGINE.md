# Multimodal Interpretation Engine

## Overview
The Multimodal Interpretation Engine is the core intelligence of the Universal Intake system. It analyzes diverse inputs (text, voice, images, SVGs, documents) to determine the user's intent and extract actionable parameters for the CAD engine.

## Input Types Supported
- **Text**: Plain English descriptions.
- **Voice**: Real-time transcription via Web Speech API.
- **Images**: PNG, JPG, WEBP.
- **SVGs**: Scalable Vector Graphics.
- **Documents**: PDF, DOCX, TXT.

## Interpretation Modes
The engine classifies the input into one of 7 modes:
1. `parametric_part`: For standard mechanical components (e.g., brackets, spacers).
2. `image_to_relief`: For creating 3D plaques or reliefs from 2D images.
3. `image_to_replica`: For generating 3D models based on 2D images.
4. `svg_to_extrusion`: For extruding 2D vector graphics into 3D shapes.
5. `document_to_model_reference`: For building models based on specifications in documents.
6. `concept_invention`: For generating novel designs based on text descriptions.
7. `needs_clarification`: When the input is too ambiguous or lacks critical information.

## Dimension Extraction
The engine parses explicit measurements from the input text, mapping them to standard parameters:
- `outer_diameter` (e.g., "20mm OD")
- `inner_diameter` (e.g., "5mm bore")
- `height` (e.g., "15mm tall")
- `width` (e.g., "50mm wide")
- `wall_thickness` (e.g., "2mm thick")

## Confidence Scoring
A confidence score (0.0 - 1.0) is calculated based on:
- The assigned mode (e.g., `parametric_part` has a higher base score than `concept_invention`).
- The presence of extracted dimensions (boosts confidence).
- The amount of missing information (penalizes confidence).

## API Endpoints
- `/api/intake/interpret`: The primary endpoint for analyzing the combined payload.
- `/api/intake/clarify`: Used by the Guided Clarification System to gather missing details.

© AI4U, LLC. AI4Utech.com, Lee Hanna-Owner.
