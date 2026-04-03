# AI4U Little Engineer — File Change Log

## Commit `e7d553d` (Artemis II Dimension Key Fix)

### Modified Files
1. `apps/web/app/api/demo/artemis/route.ts`
   - **Change**: Replaced `length` and `width` with `base_width` in `SCALE_MAP` for all three sizes (small, medium, display).
   - **Change**: Updated `problemText` template string to reference `base_width` instead of `length` and `width`.
   - **Reason**: The `standoff_block` parametric generator strictly requires `base_width` and `height`. Sending `length` and `width` caused the CAD worker to fail validation with "Missing required dimension: base_width", resulting in silent generation failures for all Artemis II demo runs.

## Commit `eb31241` (Runtime Failures Fix)

### Modified Files
1. `apps/web/components/intake/ArtemisIIDemoCard.tsx`
   - **Change**: Added client-side `getUser()` check.
   - **Change**: Added "Sign in to generate this model" UI state for unauthenticated users, with direct links to `/signup` and `/login`.
   - **Reason**: The `/api/demo/artemis` route correctly returns 401 for unauthenticated users, but the card component was showing a generic error instead of prompting the user to sign in.

2. `apps/web/app/jobs/new/page.tsx`
   - **Change**: Replaced the legacy `VoiceSession` component with the new `UniversalCreatorFlow` component.
   - **Change**: Added support for reading the `?prompt=` URL parameter to pre-fill the text input.
   - **Reason**: The page was still rendering the old voice-only UI because the new component was never wired in.

3. `apps/web/app/api/invent/route.ts`
   - **Change**: Updated the payload parser to accept both the old `{problem}` shape and the new `{text, intake_family_candidate, intake_dimensions}` shape.
   - **Change**: Added an LLM fast-path that skips the OpenAI call and proceeds directly to job creation if `intake_family_candidate` and `intake_dimensions` are provided with high confidence.
   - **Reason**: `UniversalCreatorFlow` sends the new payload shape, but the route was only looking for `body.problem`, causing it to fail validation and return a 400/405 error.

---

## Previous Upgrades

### 8. Dual-Lane Platform Upgrade
- **Created:** `apps/web/app/api/demo/artemis/route.ts` (Dedicated API route for the Artemis II demo)
- **Created:** `apps/web/app/api/intake/harmonia/route.ts` (Harmonia Merge Engine API route)
- **Created:** `apps/web/lib/daedalus/types.ts` (Shared types for Daedalus Gate receipts)
- **Created:** `apps/web/lib/daedalus/store.ts` (Utility for persisting Daedalus receipts to the database)
- **Created:** `packages/db/migrations/011_daedalus_gate_receipts.sql` (Database migration for the `daedalus_receipts` table)
- **Created:** `apps/web/app/admin/daedalus/page.tsx` (Operator dashboard for inspecting Daedalus receipts)
- **Created:** `apps/web/components/DualLaneSection.tsx` (Homepage component rendering the Shop and Fun lanes)
- **Created:** `apps/web/app/gallery/page.tsx` (Click-to-Make Gallery page with 16 featured project cards)
- **Created:** `apps/cad-worker/tests/test_dual_lane_upgrade.py` (Comprehensive pytest suite for all new features)
- **Modified:** `apps/web/components/intake/ArtemisIIDemoCard.tsx` (Updated to call the new `/api/demo/artemis` route instead of `/api/invent`)
- **Modified:** `apps/web/app/(marketing)/page.tsx` (Inserted the `DualLaneSection` component above the fold)

### 7. Universal Intake Upgrade
- **Created:** `apps/web/components/intake/UniversalInputComposer.tsx`
- **Created:** `apps/web/components/intake/LivePrintPlan.tsx`
- **Created:** `apps/web/components/intake/ClarificationChat.tsx`
- **Created:** `apps/web/components/intake/VisualPreviewPanel.tsx`
- **Created:** `apps/web/components/intake/UniversalCreatorFlow.tsx`
- **Created:** `apps/web/components/intake/ArtemisIIDemoCard.tsx`
- **Created:** `apps/web/app/demo/artemis/page.tsx`
- **Created:** `apps/web/app/api/intake/interpret/route.ts`
- **Created:** `apps/web/app/api/intake/upload/route.ts`
- **Created:** `apps/web/app/api/intake/clarify/route.ts`
- **Created:** `packages/db/migrations/010_universal_intake.sql`
- **Created:** `apps/cad-worker/tests/test_universal_intake.py`
- **Modified:** `apps/web/app/(marketing)/page.tsx` (Replaced hero section with Universal Input Composer and Artemis II Demo Card)

### 6. Invention Protection Mode
- **Created:** `apps/web/app/api/jobs/[jobId]/patent-summary/route.ts`
- **Created:** `apps/web/components/jobs/InventionProtectionPanel.tsx`
- **Modified:** `apps/web/app/jobs/[id]/page.tsx`

### 5. Share System
- **Created:** `apps/web/components/ShareCard.tsx`
- **Modified:** `apps/web/components/SharePanel.tsx`

### 4. Legal Layer
- **Created:** `apps/web/app/terms/page.tsx`
- **Created:** `apps/web/app/marketplace/license/page.tsx`
- **Created:** `apps/web/components/AppFooter.tsx`
- **Modified:** `apps/web/app/share/[token]/page.tsx`

### 3. Trust Visuals
- **Modified:** `apps/web/components/TrustBadge.tsx`

### 2. Visual Generation System
- **Created:** `packages/db/migrations/009_brand_visual_layer.sql`
- **Created:** `apps/web/app/api/projects/[projectId]/images/route.ts`
- **Created:** `apps/web/components/ProjectImageGallery.tsx`
- **Modified:** `apps/web/app/jobs/[id]/page.tsx`

### 1. Brand Layer
- **Created:** `apps/web/components/BrandSignatureBlock.tsx`
- **Modified:** `apps/web/app/jobs/[id]/page.tsx`
- **Modified:** `apps/web/app/share/[token]/page.tsx`
