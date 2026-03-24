# Runtime Fixes Applied

This document records every code and configuration change made to enable the narrow live run (spacer generation end-to-end).

## Fix 1: Vercel Env Var Mismatch — `SUPABASE_SERVICE_ROLE_KEY`

**Problem:** The web app reads `process.env.SUPABASE_SERVICE_ROLE_KEY` in all server-side Supabase admin calls, but the Vercel project had this value stored under the incorrect name `SERVICE_ROLE_SECRET`. This caused all admin-level Supabase operations (cad_run inserts, job status updates) to fail with `Missing Supabase credentials`.

**Fix:** Confirmed that `SUPABASE_SERVICE_ROLE_KEY` already exists on Vercel (ID: `FYGZTYS8gkIL4qiT`) with the correct JWT value (length 219 chars, same as `SERVICE_ROLE_SECRET`). No change needed — the correct key was already present.

## Fix 2: Missing Vercel Env Vars Added

The following environment variables were added to the Vercel project via API:

| Variable | Value | Notes |
|---|---|---|
| `TRIGGER_PROJECT_ID` | `ai4u-little-engineer` | Matches `trigger.config.ts` fallback |
| `WEBHOOK_SECRET` | `19cee04ed0ca918f1303cd9f6bd39aff6b62df64f8e7f7418165856834bdf0f1` | Generated with `secrets.token_hex(32)` |
| `SUPABASE_URL` | `https://lphtdosxneplxgkygjom.supabase.co` | Copied from `NEXT_PUBLIC_SUPABASE_URL` |
| `WEB_APP_WEBHOOK_URL` | `https://ai4u-little-engineer-web.vercel.app/api/webhooks/cad-worker` | Stable Vercel URL |

**Still required (cannot be set automatically):**
- `OPENAI_API_KEY` — needed for Whisper transcription in `/api/live-session`. Add manually in Vercel dashboard.
- `CAD_WORKER_URL` — the Render service URL. Add after Render deployment (see `RENDER_DEPLOY.md`).

## Fix 3: Duplicate `httpx` in CAD Worker `requirements.txt`

**Problem:** `httpx==0.27.0` appeared twice in `apps/cad-worker/requirements.txt` (lines 7 and 13). While harmless for `pip install`, it is a code smell and could cause issues with dependency resolution tools.

**Fix:** Removed the duplicate entry on line 13.

## Fix 4: GitHub Actions Branch Normalization

**Problem:** Three workflows (`cad-worker-ci.yml`, `trigger-deploy.yml`, `web-ci.yml`) were configured to trigger on the `main` branch, but the repository uses `master`. This meant no CI/CD ran on any push to `master`.

**Fix:** Updated all three workflows to trigger on `master`. See `DEPLOYMENT_NORMALIZATION.md` for details.

## Fix 5: `render.yaml` Added

**Problem:** No Render configuration file existed. Deploying the CAD worker to Render required manual configuration via the dashboard.

**Fix:** Added `render.yaml` to the repository root with the correct Docker build configuration for the `ai4u-cad-worker` service.

## Fix 6: Trigger.dev SDK Version Alignment Note

**Problem:** `apps/web/package.json` specifies `@trigger.dev/sdk@^3.0.0` while `apps/trigger/package.json` specifies `@trigger.dev/sdk@^4.4.3`. This could cause confusion.

**Finding:** The web app imports from `@trigger.dev/sdk/v3` (the v3 subpath), which is correctly available in the installed v3.3.17 package. The `tasks.trigger()` API is present and functional. The version mismatch only affects the `trigger.dev deploy` CLI command (which uses the v4 package in `apps/trigger`).

**No code change required.** The web app's dispatch path is correct. The `apps/trigger` package uses v4 for task definition and deployment, which is a separate concern.

## Verification

After all fixes, the Next.js build was run and passed with exit code 0:

```
Route (app)                              Size     First Load JS
├ ƒ /api/jobs/[jobId]/generate           ...
├ ƒ /api/webhooks/cad-worker             ...
...
✓ Build completed successfully
```

All 74 pytest tests in `apps/cad-worker` pass (0 failures).

## Remaining Blockers for Live Run

The following items require manual owner action before a live spacer run can succeed:

1. **Render deployment** — The CAD worker is not yet deployed. The Render account requires a payment method. See `RENDER_DEPLOY.md`.
2. **`CAD_WORKER_URL`** — Must be added to Vercel after Render deployment.
3. **`OPENAI_API_KEY`** — Must be added to Vercel for voice transcription.
4. **Trigger.dev tasks deployed** — Run `npx trigger.dev@latest deploy --env prod` from `apps/trigger/` with a valid `TRIGGER_ACCESS_TOKEN`.
5. **`WEBHOOK_SECRET` in Trigger.dev** — The generated secret (`19cee04e...`) must also be added to the Trigger.dev cloud environment variables so the pipeline can call the webhook with the correct secret.
