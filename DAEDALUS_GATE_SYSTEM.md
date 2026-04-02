# Daedalus Gate System

The **Daedalus Gate Protocol** is the central nervous system of AI4U Little Engineer's intake, preview, and generation pipeline. It provides structured, auditable proof receipts at every critical juncture.

## The Need for Receipts

As the platform scales to handle complex, multi-modal inputs (text, voice, images, documents) and routes them to different generation paths (parametric vs. concept), it becomes crucial to track *why* a decision was made.

If a user's request fails, or if a generated part is rejected by the Virtual Print Lab (VPL), operators need to know exactly what the system understood at each step.

## The Daedalus Solution

Every major transition in the pipeline now generates a `DaedalusReceipt`. These receipts are stored in the `daedalus_receipts` database table and are accessible via the operator dashboard (`/admin/daedalus`).

### The 8 Gates

1. **`intake_interpretation`**: The initial parsing of a single input modality.
2. **`harmonia_merge`**: The merging of multiple inputs into a unified request.
3. **`clarification`**: The result of a follow-up question to the user.
4. **`preview`**: The generation of the visual preview and print estimates.
5. **`vpl`**: The Virtual Print Lab's assessment of the generated geometry.
6. **`trust`**: The Trust Policy Engine's tier assignment.
7. **`generation`**: The final CAD generation step for parametric parts.
8. **`artemis_demo_generation`**: The specific generation step for the Artemis II showcase.

### Receipt Structure (`DaedalusReceipt`)

- `id`: UUID.
- `gate`: The name of the gate (from the list above).
- `session_id`: The intake session identifier (links receipts together).
- `job_id`: The generation job identifier (if applicable).
- `user_id`: The user who initiated the request.
- `timestamp`: ISO 8601 timestamp.
- `elapsed_ms`: Time taken to process the gate.
- `result`: "GO", "CLARIFY", "REJECT", or "WARN".
- `confidence`: 0.0 to 1.0 score (if applicable).
- `payload`: The full JSON payload of the decision (e.g., the merged request, the VPL score breakdown).
- `notes`: Array of human-readable explanations for the result.

### Operator Dashboard

The `/admin/daedalus` page provides a real-time view of all receipts, filterable by gate, result, session, and job. It displays key metrics like average confidence and latency, allowing operators to monitor the health of the entire intake pipeline.

© AI4U, LLC. AI4Utech.com, Lee Hanna-Owner.
