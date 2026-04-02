# Guided Clarification System

## Overview
The Guided Clarification System is a conversational interface that engages the user when the Multimodal Interpretation Engine determines that the input is ambiguous or lacks critical information. It ensures that the CAD engine receives a complete and actionable set of parameters before generation.

## Components

### 1. `ClarificationChat.tsx`
A React component that renders the conversational interface.
- Displays the assistant's questions and the user's replies.
- Sends the user's input to `/api/intake/clarify`.
- Updates the parent state (`UniversalCreatorFlow`) with the new interpretation results.

### 2. `/api/intake/clarify`
An API route that processes the user's reply and updates the interpretation state.
- **Input**: The user's reply and the current session ID.
- **Output**: A `ClarifyResponse` object containing:
  - `next_question`: The next question to ask the user (if any).
  - `ready_to_generate`: A boolean indicating if the interpretation is complete.
  - `assistant_message`: The assistant's response to the user.
  - `updated_dimensions`: Any new dimensions extracted from the user's reply.
  - `updated_missing_information`: The remaining missing information.
  - `updated_confidence`: The new confidence score.
  - `updated_mode`: The new interpretation mode (if changed).

## Workflow
1. The Multimodal Interpretation Engine returns a `needs_clarification` mode or a low confidence score.
2. The `UniversalCreatorFlow` transitions to the `clarifying` phase and renders the `ClarificationChat`.
3. The assistant asks the user for the missing information.
4. The user replies, and the `ClarificationChat` sends the reply to `/api/intake/clarify`.
5. The API route updates the interpretation state and returns the next question or a `ready_to_generate` flag.
6. The `ClarificationChat` updates the parent state, and the `LivePrintPlan` reflects the new information.
7. Once `ready_to_generate` is true, the `UniversalCreatorFlow` transitions to the `previewing` phase.

© AI4U, LLC. AI4Utech.com, Lee Hanna-Owner.
