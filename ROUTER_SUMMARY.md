# Router Summary

## Current Truth
The repository has drifted into multiple deployment strategies and feature expansions.
- **Web App:** Hosted on Vercel, but missing critical environment variables (`TRIGGER_PROJECT_ID`, `WEBHOOK_SECRET`, `OPENAI_API_KEY`) and has a misnamed variable (`SERVICE_ROLE_SECRET` instead of `SUPABASE_SERVICE_ROLE_KEY`).
- **CAD Worker:** Currently has a GitHub Actions workflow targeting Google Cloud Run (`deploy-cad-worker.yml`), which is broken/deferred. No Render service exists yet.
- **Orchestration:** Trigger.dev is configured in the codebase, but the `trigger-deploy.yml` workflow targets the `main` branch, while the active branch is `master`.
- **Database:** Supabase is active and the schema is generally correct, though recent migrations added tables for out-of-scope features (printer profiles, feedback, tags).
- **Branching:** The active development branch is `master`, but several CI/CD workflows are hardcoded to trigger on `main`.

## Chosen Route
To achieve the narrow goal of one real proven live spacer run, the following route is locked in:
1. **Web App:** Vercel (with corrected environment variables).
2. **CAD Worker:** Render (Docker deployment of `apps/cad-worker`).
3. **Orchestration:** Trigger.dev Cloud (not self-hosted, not Railway).
4. **Database/Auth/Storage:** Supabase.
5. **Branch:** `master` (all workflows will be normalized to this).

## Intentionally Ignored This Pass
- **Cloud Run Deployment:** The `deploy-cad-worker.yml` workflow will be disabled/ignored.
- **Railway Deployment:** Any references to Railway for Trigger.dev or the CAD worker are abandoned.
- **Phase 3 Features:** Billing, Stripe, Admin Dashboard, Public Sharing, Tags, Printer Profiles, and Print Feedback are completely ignored. They remain in the codebase to avoid breaking imports, but will not be tested or wired up.
- **FreeCAD Engine:** The `ENABLE_FREECAD_ADAPTER` flag remains `false`. Only `build123d` is used.
