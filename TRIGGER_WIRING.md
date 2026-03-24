# Trigger.dev Wiring Guide

## Overview
The Trigger.dev pipeline (`cad-generation-pipeline`) is the sole authoritative writer for the `cad_runs`, `artifacts`, and `jobs` tables. The web app dispatches the task via `tasks.trigger()` and the CAD worker receives the generation request from the pipeline. This document describes the exact wiring required to make this work end-to-end.

## SDK Version Alignment

| Component | SDK Version | Import Path | Status |
|---|---|---|---|
| `apps/web` (dispatch) | `@trigger.dev/sdk@^3.0.0` (v3.3.17 installed) | `@trigger.dev/sdk/v3` | Compatible |
| `apps/trigger` (task definition) | `@trigger.dev/sdk@^4.4.3` | `@trigger.dev/sdk/v3` | Deploy with v4 CLI |

The web app uses the v3 subpath export (`@trigger.dev/sdk/v3`) which exposes `tasks.trigger()`. This is the correct API for dispatching tasks to Trigger.dev Cloud. The trigger app uses SDK v4 for the task definition and deployment, which is backward-compatible with v3 dispatch calls from the web app.

**Action Required:** Update `apps/web/package.json` to use `@trigger.dev/sdk@^3.3.17` (pin to the installed version) to avoid accidental upgrades that could break the v3 subpath import.

## Task Contract

The `cad-generation-pipeline` task (ID: `"cad-generation-pipeline"`) accepts the following payload:

```typescript
{
  job_id: string;       // UUID — must exist in public.jobs
  cad_run_id: string;   // UUID — must exist in public.cad_runs (status: "queued")
  part_spec_id: string; // UUID — must exist in public.part_specs
  variant_type?: "requested" | "stronger" | "print_optimized" | "alternate"; // default: "requested"
  engine?: "build123d" | "freecad"; // default: "build123d"
}
```

## Environment Variables Required

### Trigger.dev Cloud Dashboard (set in project environment variables)
These must be set in the Trigger.dev cloud project settings at [cloud.trigger.dev](https://cloud.trigger.dev):

| Variable | Description | Where to Get It |
|---|---|---|
| `SUPABASE_URL` | Supabase project URL | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (bypasses RLS) | Supabase → Settings → API |
| `CAD_WORKER_URL` | Render service URL | Render dashboard after deployment |
| `WEB_APP_WEBHOOK_URL` | `https://your-app.vercel.app/api/webhooks/cad-worker` | Vercel deployment URL |
| `WEBHOOK_SECRET` | Shared secret for webhook auth | Generate with `openssl rand -hex 32` |

### Vercel (web app environment variables)
These must be set in the Vercel project settings:

| Variable | Description | Current Status |
|---|---|---|
| `TRIGGER_SECRET_KEY` | Trigger.dev secret key for dispatch | **Set** (production only) |
| `TRIGGER_PROJECT_ID` | Trigger.dev project ID | **Missing** — needs to be added |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key | **Wrong name** — currently `SERVICE_ROLE_SECRET` |
| `OPENAI_API_KEY` | For Whisper transcription | **Missing** |
| `WEBHOOK_SECRET` | For webhook verification | **Missing** |
| `CAD_WORKER_URL` | Render service URL | **Missing** |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase URL | **Set** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | **Set** |

## Deploying the Trigger.dev Tasks

The `trigger-deploy.yml` workflow auto-deploys when changes are pushed to `master` in `apps/trigger/`. For a manual first deploy:

```bash
cd apps/trigger
pnpm install
TRIGGER_ACCESS_TOKEN=<your_token> npx trigger.dev@latest deploy --env prod
```

The `TRIGGER_ACCESS_TOKEN` is a **personal access token** from [cloud.trigger.dev](https://cloud.trigger.dev) → Account Settings → Access Tokens. This is different from the `TRIGGER_SECRET_KEY` (which is the project-level secret for dispatching tasks).

After deploying, add `TRIGGER_ACCESS_TOKEN` as a GitHub repository secret to enable the CI/CD workflow.

## Project ID Configuration
The `trigger.config.ts` uses `process.env.TRIGGER_PROJECT_ID ?? "ai4u-little-engineer"` as the project identifier. The actual project ID from Trigger.dev Cloud must be set as `TRIGGER_PROJECT_ID` in both:
1. The Vercel environment variables (so the web app can dispatch to the correct project).
2. The GitHub repository secrets (so the deploy workflow targets the correct project).

The project ID is visible in the Trigger.dev Cloud dashboard URL: `https://cloud.trigger.dev/orgs/{org}/projects/{project-id}`.

## Webhook Flow
After the pipeline completes, it calls `WEB_APP_WEBHOOK_URL` with a notification payload. The web app's webhook handler at `/api/webhooks/cad-worker` verifies the `WEBHOOK_SECRET` and logs the notification. It does **not** write to the database (the pipeline is the sole DB writer). This is by design to prevent duplicate writes.

## Verification Steps
After setting all environment variables, verify the wiring is correct:

1. Check the Trigger.dev Cloud dashboard shows the `cad-generation-pipeline` task as deployed.
2. Submit a test job via the web app UI.
3. Observe the Trigger.dev Cloud dashboard for a new run of `cad-generation-pipeline`.
4. Verify the run transitions from `EXECUTING` → `COMPLETED`.
5. Check the Supabase `cad_runs` table — the row should have `status = 'success'`.
6. Check the Supabase `artifacts` table — two rows (STEP + STL) should be present with non-null `storage_path`.
7. Check the Supabase Storage `cad-artifacts` bucket — the files should be present at `{job_id}/{cad_run_id}/`.
