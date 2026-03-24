# Scope Freeze Report

## Mission Context
The goal of this pass is to stop scope creep, stabilize the current stack, and prove one real live end-to-end spacer run. This is NOT a feature pass.

## Scope Creep Identified
During the deep audit of the repository, the following "Phase 3" and monetization features were identified as scope creep beyond the narrow v1 goal:

1. **Billing & Stripe Integration**
   - `apps/web/app/api/billing/checkout/route.ts`
   - `apps/web/app/api/billing/portal/route.ts`
   - `apps/web/app/api/billing/webhook/route.ts`
   - `apps/web/app/billing/success/page.tsx`
   - `apps/web/app/pricing/page.tsx`

2. **Admin Dashboard & System Health**
   - `apps/web/app/admin/layout.tsx`
   - `apps/web/app/admin/page.tsx`
   - `apps/web/app/api/admin/system-health/route.ts`

3. **Public Sharing & Tags**
   - `apps/web/app/api/jobs/[jobId]/share/route.ts`
   - `apps/web/app/api/jobs/[jobId]/tags/route.ts`
   - `apps/web/app/share/[token]/page.tsx`

4. **Printer Profiles & Feedback Loop**
   - `apps/web/app/api/settings/printer-profile/route.ts`
   - `apps/web/app/settings/printer/page.tsx`
   - `apps/web/app/api/jobs/[jobId]/feedback/route.ts`
   - `apps/web/app/api/jobs/[jobId]/print-result/route.ts`
   - `apps/web/app/jobs/[id]/print-result/page.tsx`

## Actions Taken
- **Disabled/Deferred:** All Cloud Run deployment workflows (`deploy-cad-worker.yml`) and Railway references have been explicitly deferred. The focus is strictly on Render for the CAD worker.
- **Left Untouched:** The scope creep files listed above compile cleanly and do not interfere with the core `POST /api/jobs/[jobId]/generate` path. Rather than deleting them and risking broken imports or routing errors, they have been left untouched but isolated. They will not be wired up or tested in this pass.
- **Schema:** The database schema migrations (`001_printer_profiles.sql`, `002_print_feedback.sql`, `003_tags_and_sharing.sql`) remain in the repo but are not required for the core spacer run. The core tables (`jobs`, `cad_runs`, `artifacts`, `part_specs`) are stable and aligned with the Trigger.dev pipeline.

## What Remains in Narrow v1 Scope
The only path being actively supported and proven in this pass is:
1. User logs in via Supabase Auth.
2. User submits a voice/text request for a spacer.
3. Web app calls `POST /api/live-session` (using OpenAI Whisper + GPT-4.1 JSON path or Gemini Live).
4. Web app calls `POST /api/jobs/[jobId]/generate`.
5. Trigger.dev cloud orchestrates the `cad-generation-pipeline`.
6. Render-hosted CAD worker generates the STEP/STL files using `build123d`.
7. CAD worker uploads artifacts directly to Supabase Storage (`cad-artifacts` bucket).
8. Trigger.dev writes the `receipt.json` and updates DB state to `awaiting_approval`.
9. User downloads the artifacts.
