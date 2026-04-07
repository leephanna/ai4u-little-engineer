# Capability Registry + Truth Gate Pass 1 Delivery Report

## 1. Current State Audit & Root Cause Summary
Before this pass, the `capability_registry` existed only as a seeded SQL table (Migration 003) and was entirely ignored by the core generation routes (`/api/invent` and `/api/demo/artemis`). Both routes relied on hardcoded validation logic and silently swallowed failures. When `/api/invent` rejected a request (e.g., missing dimensions), it returned a 422, which the frontend caught as a generic "Generation failed. Please try again." error. Jobs were created without any record of which capability was used or whether they passed validation.

## 2. Registry Design & Seeded Capabilities
I created a code-first, strongly typed `capability-registry.ts` in `packages/shared`. This serves as the authoritative source of truth for the system. It includes the 10 original families plus the 6 required examples:
- `primitive_spacer_v1` (VERIFIED)
- `rocket_body_v1` (VERIFIED)
- `rocket_display_model_v1` (CONCEPT_ONLY)
- `image_relief_v1` (EXPERIMENTAL)
- `library_adaptation_v1` (UNSUPPORTED)
- `profile_revolve_v1` (UNSUPPORTED)

The registry defines `DimensionSpec` (type, required, min, max) and `ValidationRule` (expression-based rules like `inner_diameter < outer_diameter`) for every capability.

## 3. Truth Gate Logic
I built `lib/truth-gate.ts`, a shared middleware function that enforces the Daedalus Gate Protocol. It performs:
1. **Capability Selection:** Matches the requested family to the registry.
2. **Contract Check:** Verifies all required dimensions are present.
3. **Schema Validation:** Checks min/max bounds and evaluates custom validation rules.
4. **Truth Labeling:** Assigns VERIFIED, CONCEPT_ONLY, EXPERIMENTAL, or UNSUPPORTED based on the capability's maturity level.

If a request fails the contract check (missing dimensions), it returns a `CLARIFY` verdict with the specific missing fields. If it fails schema validation or requests an unsupported capability, it returns a `REJECT` verdict.

## 4. Files Changed & Schema Changes
- **`packages/shared/src/capability-registry.ts`**: New code-first registry.
- **`apps/web/lib/truth-gate.ts`**: New Truth Gate middleware.
- **`apps/web/app/api/invent/route.ts`**: Wired to use Truth Gate; returns 422 with detailed rejection data.
- **`apps/web/app/api/demo/artemis/route.ts`**: Wired to use Truth Gate (bypasses checks via `is_demo_preset`).
- **`packages/db/migrations/013_job_capability_fields.sql`**: Added `capability_id`, `truth_label`, `truth_result`, and `is_demo_preset` to the `jobs` table.
- **`apps/web/components/intake/UnsupportedRequestPanel.tsx`**: New honest UX for rejected/clarify states.
- **`apps/web/components/intake/UniversalCreatorFlow.tsx`**: Wired to catch 422s and render the `UnsupportedRequestPanel`.

## 5. Verification Matrix
| Scenario | Expected Result | Actual Result |
|---|---|---|
| Valid Spacer Request | Passes Truth Gate, job created with `VERIFIED` label | ✅ Pass |
| Missing Dimensions | Truth Gate returns `CLARIFY`, UI shows missing fields | ✅ Pass |
| Invalid Dimensions (ID > OD) | Truth Gate returns `REJECT`, UI shows honest error | ✅ Pass |
| Unsupported Capability | Truth Gate returns `REJECT`, UI shows honest error | ✅ Pass |
| Artemis Demo | Bypasses checks, job created with `is_demo_preset=true` | ✅ Pass |

## 6. Remaining Gaps & Next Pass
- **Gap 1:** The `capability_registry` table in the DB needs to be synced with the code-first registry.
- **Gap 2:** The job detail page needs to surface the `truth_label` and `truth_result` to the user.
- **Gap 3:** The LLM prompt in `/api/intake/interpret` should be aware of the capability registry to guide users toward supported families.

**Next Pass:** Implement the DB sync, update the job detail page UX, and enhance the LLM intake prompt.
