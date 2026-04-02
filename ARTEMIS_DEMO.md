# Artemis II Demo Flow

## Overview
The Artemis II Demo Flow is a featured showcase experience within the Universal Intake system. It allows users to generate a commemorative scale model of the Artemis II rocket and launch pad, bypassing the standard interpretation flow and using pre-configured parameters.

## Components

### 1. `ArtemisIIDemoCard.tsx`
A React component that renders the featured demo card.
- **Disclaimer**: Clearly states that the model is a commemorative/showcase print inspired by the Artemis II mission, not an official NASA model or NASA-endorsed product.
- **Configuration**: Allows users to select the scale (small, medium, display), material (PLA, PETG, ABS), and quality (draft, standard, fine).
- **Preview Stats**: Displays estimated print time and filament usage based on the selected scale.
- **VPL Preview**: Shows a simulated VPL score and trust tier based on the selected quality.
- **Generation**: Triggers the `/api/invent` route with the pre-configured parameters.

### 2. `/demo/artemis/page.tsx`
A dedicated page for the Artemis II Demo Flow.
- **Hero Section**: Introduces the demo experience with a prominent AI4U badge and a clear description.
- **Demo Card**: Embeds the `ArtemisIIDemoCard` component.
- **What You Get**: Highlights the benefits of the generated model (e.g., "Rocket + Launch Pad", "VPL Validated", "Printer-Aware").

## Workflow
1. The user navigates to the `/demo/artemis` page or clicks the "Try Artemis II Demo" button on the homepage.
2. The `ArtemisIIDemoCard` is displayed, allowing the user to configure the scale, material, and quality.
3. The user reviews the preview stats and VPL score.
4. The user clicks "GO — Generate Artemis II Demo", triggering the `/api/invent` route with the pre-configured parameters.
5. The generated model is displayed on the job result page.

© AI4U, LLC. AI4Utech.com, Lee Hanna-Owner.
