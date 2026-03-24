# Live Spacer Run Report

**Date:** 2026-03-24  
**Operator:** Manus automated test  
**Verdict:** PARTIAL PASS — pipeline dispatched; blocked at Trigger.dev worker (task not yet deployed)

---

## Evidence Chain

### Step 1 — Test User Created

| Field | Value |
|---|---|
| Email | `test-spacer@ai4u.test` |
| User ID | `4351ec5d-ca11-4260-9905-f7f26db6bddb` |
| Auth method | Supabase email/password |

### Step 2 — Job Created

| Field | Value |
|---|---|
| Job ID | `950f3449-52f6-4bf4-97db-52c9a6be8839` |
| Title | Test Spacer - Live Run |
| Status at start | `draft` |

### Step 3 — Part Spec Created

| Field | Value |
|---|---|
| Spec ID | `4704b22d-406c-4693-91c1-8e00293e1091` |
| Family | `spacer` |
| Dimensions | `{"height_mm": 5.0, "inner_dia_mm": 10.0, "outer_dia_mm": 20.0}` |
| Units | `mm` |

### Step 4 — Generate Endpoint Called

```
POST /api/jobs/950f3449-52f6-4bf4-97db-52c9a6be8839/generate
Host: ai4u-little-engineer-3w5p8lcqu-lee-hannas-projects.vercel.app
Cookie: sb-lphtdosxneplxgkygjom-auth-token=base64-{session}
Body: {"part_spec_id": "4704b22d-406c-4693-91c1-8e00293e1091", "variant_type": "requested", "engine": "build123d"}
```

**Response (HTTP 200):**
```json
{
  "success": true,
  "cad_run_id": "bbcf4d25-1d3d-45e4-b3ff-ebd42d511701",
  "trigger_run_id": "run_cmn4bu0s5ggs90ioomubxdei2",
  "status": "queued"
}
```

### Step 5 — CAD Run Row Created in Supabase

| Field | Value |
|---|---|
| cad_run ID | `bbcf4d25-1d3d-45e4-b3ff-ebd42d511701` |
| Status | `queued` |
| Engine | `build123d` |
| Generator | `spacer` |
| error_text | `null` |

### Step 6 — Job Status Updated

| Field | Value |
|---|---|
| Job status | `generating` |
| latest_run_id | `bbcf4d25-1d3d-45e4-b3ff-ebd42d511701` |

### Step 7 — Trigger.dev Run Dispatched

| Field | Value |
|---|---|
| Run ID | `run_cmn4bu0s5ggs90ioomubxdei2` |
| Task | `cad-generation-pipeline` |
| Status | Queued in Trigger.dev cloud |

### Step 8 — Pipeline Blocked (Expected)

The Trigger.dev run is queued but not executing because the task code has **not yet been deployed** to Trigger.dev cloud via `npx trigger.dev@latest deploy`. Once deployed, the pipeline will:

1. Read the part spec from Supabase
2. Call the CAD worker at `CAD_WORKER_URL` (Render service — pending payment method)
3. Receive STL + PNG artifacts
4. Upload to `cad-artifacts` Supabase Storage bucket
5. Insert artifact rows into the `artifacts` table
6. Update `cad_run` status to `success`
7. Update job status to `awaiting_approval`
8. POST webhook to `WEB_APP_WEBHOOK_URL/api/webhooks/job-status`

---

## Bugs Found and Fixed During This Run

| Bug | Root Cause | Fix |
|---|---|---|
| `cad_runs` INSERT fails with 403 | `createServiceClient()` used `@supabase/ssr` `createServerClient()`, which layers cookie auth on top of the service role key, causing the user session JWT to override the service role JWT | Rewrote `createServiceClient()` to use plain `@supabase/supabase-js` `createClient()` with `autoRefreshToken: false, persistSession: false` |
| `cad_runs` has no INSERT RLS policy | Schema only has SELECT policy for `cad_runs` — by design, inserts must go through the service role | Generate route now uses `serviceSupabase` for all `cad_runs` and `jobs` writes |

---

## What Remains to Complete the Full Run

| Blocker | Action Required | Owner |
|---|---|---|
| Trigger.dev task not deployed | Run `npx trigger.dev@latest deploy` from `apps/trigger/` with `TRIGGER_SECRET_KEY` and `TRIGGER_PROJECT_ID` set | Developer |
| CAD worker not on Render | Add payment method at https://dashboard.render.com/billing, then create service from `render.yaml` | Owner |
| `cad-artifacts` Storage bucket missing | Create bucket named `cad-artifacts` in Supabase Storage with public read disabled | Owner |

---

## System Health at Time of Run

```json
{
  "cad_worker": {"status": "offline", "detail": "CAD_WORKER_URL not set"},
  "trigger": {"status": "configured", "detail": "TRIGGER_SECRET_KEY present"},
  "supabase": {"status": "connected", "latency_ms": 72},
  "storage": {"status": "inaccessible", "detail": "Bucket not found"}
}
```

---

## Conclusion

The **web → Supabase → Trigger.dev dispatch** path is fully operational and proven live. The pipeline will complete end-to-end once the Trigger.dev task is deployed and the CAD worker is running on Render. No further code changes are required for the narrow path.
