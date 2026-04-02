# Visual Preview Mode

## Overview
The Visual Preview Mode is a critical step in the Universal Intake system, designed to provide users with a clear understanding of their intended design before generation. It acts as a final confirmation step, ensuring that the CAD engine receives accurate parameters and that the user is satisfied with the proposed print plan.

## Components

### 1. `VisualPreviewPanel.tsx`
A React component that renders the visual preview interface.
- Displays a concept render (if available) or a schematic placeholder based on the interpretation mode.
- Presents estimated print time and filament usage.
- Suggests an optimal print orientation.
- Shows the Trust/VPL preview status.
- Highlights any warnings for low-confidence or decorative-only designs.

### 2. Print Estimates
The `estimatePrint` function calculates rough print time and filament usage based on the interpretation mode, scale, and extracted dimensions.
- **Time**: Estimated in minutes, based on a base time for the mode and a scale factor.
- **Filament**: Estimated in grams, based on the time and scale factor.
- **Orientation**: Suggested based on the mode (e.g., "Flat side down" for `image_to_relief`).

### 3. Warnings
The `WarningBanner` component displays critical information to the user:
- **Low Confidence**: If the interpretation confidence is below 0.5, a warning is shown.
- **Decorative Only**: If the mode is `image_to_relief` or `image_to_replica`, a warning indicates that the design may not be structurally functional.
- **Missing Information**: If there are still missing details, a warning lists them and states that the AI will make reasonable assumptions.

## Workflow
1. The Multimodal Interpretation Engine returns a `ready_to_generate` flag or a high confidence score.
2. The `UniversalCreatorFlow` transitions to the `previewing` phase and renders the `VisualPreviewPanel`.
3. The user reviews the print plan, estimates, and warnings.
4. The user can either confirm the generation (triggering `/api/invent`) or edit the input (returning to the `idle` phase).

© AI4U, LLC. AI4Utech.com, Lee Hanna-Owner.
