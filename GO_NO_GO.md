# Go / No-Go Decision

**Date:** 2026-03-24  
**Scope:** AI4U Little Engineer — Stabilization Pass

---

## Verdict: NO-GO (3 owner actions required before first real user run)

The codebase is **code-complete and deployment-ready**. Three infrastructure actions that require owner credentials are blocking the first full end-to-end run. None require code changes.

---

## Gate Checklist

| # | Gate | Status | Owner Action |
|---|---|---|---|
| 1 | Web app builds with zero TypeScript errors | **PASS** | — |
| 2 | All 74 pytest tests pass | **PASS** | — |
| 3 | All GitHub Actions workflows target `master` | **PASS** | — |
| 4 | Vercel deployment is live and healthy | **PASS** | — |
| 5 | Supabase connected (latency 72ms) | **PASS** | — |
| 6 | `cad_runs` INSERT via service role works | **PASS** | — |
| 7 | Generate endpoint creates `cad_run` + dispatches Trigger.dev | **PASS** | — |
| 8 | Trigger.dev run ID returned (`run_cmn4bu0s5ggs90ioomubxdei2`) | **PASS** | — |
| 9 | Trigger.dev task deployed to cloud | **BLOCKED** | Run `npx trigger.dev@latest deploy` from `apps/trigger/` |
| 10 | CAD worker running on Render | **BLOCKED** | Add payment method at render.com/billing, then deploy from `render.yaml` |
| 11 | `cad-artifacts` Storage bucket exists | **BLOCKED** | Create bucket in Supabase Storage dashboard |

---

## Three Owner Actions (in order)

### Action 1 — Deploy Trigger.dev Task

```bash
cd apps/trigger
export TRIGGER_SECRET_KEY="tr_dev_..."   # from trigger.dev dashboard
export TRIGGER_PROJECT_ID="ai4u-little-engineer"  # confirm in dashboard
npx trigger.dev@latest deploy
```

This registers the `cad-generation-pipeline` task with Trigger.dev cloud. The queued run `run_cmn4bu0s5ggs90ioomubxdei2` will immediately start executing once the task is deployed.

### Action 2 — Deploy CAD Worker to Render

1. Go to https://dashboard.render.com/billing and add a payment method
2. Go to https://dashboard.render.com/new and select "From a YAML file"
3. Connect the `leephanna/ai4u-little-engineer` repo — Render will detect `render.yaml`
4. Set these environment variables in the Render dashboard:
   - `SUPABASE_URL` = `https://lphtdosxneplxgkygjom.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` = (from Supabase dashboard → Settings → API)
5. Copy the Render service URL (e.g. `https://ai4u-cad-worker.onrender.com`)
6. Add `CAD_WORKER_URL` to Vercel env vars with that URL

See `RENDER_DEPLOY.md` for full step-by-step instructions.

### Action 3 — Create Supabase Storage Bucket

1. Go to https://supabase.com/dashboard/project/lphtdosxneplxgkygjom/storage/buckets
2. Click "New bucket"
3. Name: `cad-artifacts`
4. Public: **No** (private — artifacts are served via signed URLs)
5. Click "Save"

---

## What Happens After All 3 Actions

The queued Trigger.dev run will execute the full pipeline:

```
Trigger.dev cloud
  → reads part_spec from Supabase
  → calls CAD worker /generate endpoint
  → CAD worker runs build123d spacer generator
  → returns STL + PNG artifacts
  → uploads to cad-artifacts bucket
  → inserts artifact rows
  → updates cad_run status = "success"
  → updates job status = "awaiting_approval"
  → POSTs webhook to Vercel /api/webhooks/job-status
```

The user will then see the job in `awaiting_approval` state with a 3D STL preview.

---

## Risk Register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Trigger.dev SDK v3 (web) vs v4 (task) mismatch | Low | The web app uses `tasks.trigger()` from `@trigger.dev/sdk/v3` subpath which is API-compatible with Trigger.dev cloud v3 tasks. The task app uses `^4.4.3` for `defineConfig` only. |
| CAD worker cold start on Render free tier | Medium | First request may take 30-60s. Trigger.dev has a 5-minute timeout per task step. |
| `cad-artifacts` bucket permissions | Low | CAD worker uses service role key for uploads. Trigger.dev pipeline uses service role for artifact inserts. |
