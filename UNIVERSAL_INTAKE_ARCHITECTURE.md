# Universal Intake Architecture

## Overview
The Universal Intake system transforms AI4U Little Engineer from a text-only parametric generator into a multimodal, consumer-friendly creation platform. It acts as the intelligent front-door to the CAD engine, interpreting diverse inputs (text, voice, images, SVGs, documents) and guiding the user through a clarification and preview flow before generation.

## Core Components

### 1. Universal Input Composer (`UniversalInputComposer.tsx`)
A unified React component that accepts:
- **Text**: Plain English descriptions.
- **Voice**: Real-time transcription via Web Speech API.
- **Files**: Drag-and-drop support for images (PNG/JPG/WEBP), SVGs, and documents (PDF/DOCX/TXT).

### 2. Multimodal Interpretation Engine (`/api/intake/interpret`)
An API route that analyzes the combined payload (text + files) to determine the user's intent.
- **Mode Classification**: Routes the request to one of 7 modes (e.g., `parametric_part`, `image_to_relief`, `concept_invention`).
- **Dimension Extraction**: Parses explicit measurements (e.g., "20mm OD").
- **Confidence Scoring**: Calculates a confidence score (0.0 - 1.0) based on the mode, extracted dimensions, and missing information.

### 3. Guided Clarification System (`ClarificationChat.tsx` & `/api/intake/clarify`)
If the interpretation confidence is low or critical information is missing, this system engages the user in a conversational flow to gather the necessary details. It updates the `LivePrintPlan` in real-time.

### 4. Visual Preview Mode (`VisualPreviewPanel.tsx`)
Before triggering the CAD engine, this panel presents a summary of the print plan, including:
- Estimated print time and filament usage.
- Suggested print orientation.
- Trust/VPL preview status.
- Warnings for low-confidence or decorative-only designs.

### 5. Artemis II Demo Flow (`ArtemisIIDemoCard.tsx`)
A featured showcase experience that allows users to generate a commemorative Artemis II launch pad model. It bypasses the standard interpretation flow, using pre-configured parameters based on user-selected scale, material, and quality.

## Data Flow
1. User interacts with `UniversalInputComposer`.
2. Payload sent to `/api/intake/interpret`.
3. If `needs_clarification`, user interacts with `ClarificationChat` (calls `/api/intake/clarify`).
4. Once ready, `VisualPreviewPanel` is shown.
5. User confirms, triggering `/api/invent` to generate the CAD model.

## Database Schema
Migration `010_universal_intake.sql` introduces:
- `intake_sessions`: Tracks the state of an intake interaction.
- `uploaded_files`: Stores metadata for files uploaded during intake.

© AI4U, LLC. AI4Utech.com, Lee Hanna-Owner.
