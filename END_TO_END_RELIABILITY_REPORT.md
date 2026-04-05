# End-to-End Reliability Pass — AI4U Little Engineer

**Commit:** `f1e16c9`
**Branch:** `master` — pushed to `origin/master`
**Compliance:** TypeScript ✓ | ESLint ✓ | pytest 257/257 ✓ | Jest 26/26 ✓

## What Was Built

### 1. Live Job Hydration (The "Stale Handoff" Fix)
**Files:** `app/jobs/[id]/page.tsx`, `components/jobs/JobLiveHydration.tsx`
**Root Cause:** The job detail page was a pure Server Component. When `router.push` fired 1.5s after job creation, it rendered a snapshot of the DB in the `generating` state and never refreshed.
**Fix:** Created a tiny, invisible client wrapper (`JobLiveHydration`) that mounts only when `isNonTerminal` is true. It polls `/api/jobs/[id]` every 2 seconds and calls `router.refresh()` when the status changes or artifacts arrive. The page now seamlessly transitions from generating → preview without a manual reload.

### 2. Misleading Generating UI
**Files:** `app/jobs/[id]/page.tsx`, `components/jobs/JobProgressBanner.tsx`
**Root Cause:** The `ValidationBadge` component was rendering even when the CAD run was still `running`, showing a red "Failed" state because the validation report was empty.
**Fix:** Guarded `ValidationBadge` to only show for terminal run states (`success`, `failed`). Added a new `JobProgressBanner` that shows a friendly spinner and clear status text ("Generating CAD", "Running Virtual Print Lab") while the job is active.

### 3. Robust Clarify Parsing & Context Preservation
**Files:** `app/api/intake/clarify/route.ts`
**Root Cause:** The LLM was dropping previously extracted dimensions on subsequent turns, and couldn't handle multiple dimensions in a single reply (e.g., "120mm tall, 40mm base").
**Fix:** Rewrote the system prompt and merge logic. The route now explicitly passes all prior `extracted_dimensions` back to the LLM and merges the result (`{...existing, ...updated}`). A single reply can now populate multiple slots simultaneously.

### 4. Derived-Fit Logic ("Rocket sized to fit stand")
**Files:** `app/api/intake/clarify/route.ts`, `components/intake/UniversalCreatorFlow.tsx`
**Root Cause:** The LLM didn't know how to handle relational sizing requests.
**Fix:** Added `fit_envelope` to the clarify schema. If the user says "sized to fit [object]", the LLM extracts the reference object's dimensions into `fit_envelope`. This is passed through to `/api/invent`, allowing the CAD engine to derive the correct sizing.

### 5. Structured Fallback (The "Hiccup Loop" Fix)
**Files:** `app/api/intake/clarify/route.ts`, `components/intake/ClarifyFallbackForm.tsx`, `components/intake/UniversalCreatorFlow.tsx`
**Root Cause:** If the LLM failed to parse the user's reply, it returned a generic "Sorry, I had a hiccup" message indefinitely.
**Fix:** Added a `clarify_fail_count` to the session. If the LLM fails twice, the route returns `fallback_form: true`. The UI then swaps the chat for a structured `ClarifyFallbackForm` (Object Type, Size, Material, Purpose, Detail Level). The user always has a guaranteed path forward.

## Verification Checklist
- [x] Create a new part via Try Demo
- [x] Job detail page loads and shows "Generating CAD" spinner
- [x] Page automatically refreshes when job completes, showing the 3D preview
- [x] Clarify chat remembers dimensions across multiple turns
- [x] Clarify chat handles multiple dimensions in one reply
- [x] Clarify chat falls back to the structured form after 2 failed attempts
