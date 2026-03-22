# AI4U Little Engineer — Full Upgrade Summary

**Commit:** `703b9b3` · **Branch:** `master` · **66 files changed, 6,521 insertions**

---

## What Was Built

### Phase 1 — Foundation Fixes

| Area | What Was Done |
|---|---|
| **CAD Worker Docker** | Multi-stage `Dockerfile` with CadQuery, Open CASCADE, and all Python deps |
| **GitHub Actions CI/CD** | `.github/workflows/deploy-cad-worker.yml` — builds, pushes to GCR, deploys to Cloud Run on every `master` push |
| **System Health API** | `GET /api/admin/system-health` — checks Supabase, OpenAI, Stripe, and Resend connectivity |
| **STL Viewer** | `StlViewer.tsx` — Three.js + OrbitControls, lazy-loaded, wireframe toggle, fullscreen, error boundary |
| **Printer Profiles** | DB migration `001_printer_profiles.sql`, settings UI at `/settings/printer`, CAD worker reads tolerances per profile |
| **4 New Generators** | `flat_bracket.py`, `standoff_block.py`, `adapter_bushing.py`, `simple_jig.py` — all with pytest coverage |

### Phase 2 — Cutting-Edge Features

| Area | What Was Done |
|---|---|
| **Landing Page** | Full rewrite targeting 3D printer owners — hero with animated tagline, feature grid, social proof, pricing CTA |
| **Print Time Estimation** | Volume-based formula in CAD worker (`utils/print_time.py`), stored in `cad_runs.print_time_estimate_min` |
| **Revision Flow** | `RevisionPanel.tsx` — submit natural-language revision requests; `POST /api/jobs/[jobId]/revise` creates new spec version |
| **Stripe Billing** | Free / Maker ($9/mo) / Pro ($29/mo) tiers; checkout, portal, and webhook routes; generation gate in job creation |
| **Pricing Page** | `/pricing` — `PricingCards.tsx` with plan comparison, Stripe checkout redirect, current plan badge |
| **Print Feedback** | DB migration `002_print_feedback.sql`, `PrintFeedbackForm.tsx`, `POST /api/jobs/[jobId]/feedback` |
| **Email Notifications** | `lib/email/resend.ts` — job completion and failure emails via Resend; triggered from CAD worker webhook |

### Phase 3 — Production Polish

| Area | What Was Done |
|---|---|
| **Dashboard Redesign** | Stats row (total/active/printed/this-month), quick-action buttons, `SystemStatusBar` live health indicator |
| **PWA Hardening** | Updated `manifest.json`, apple-touch-icon, favicon-32, icon-192, icon-512 in `/public/icons/` |
| **Loading / Error States** | Global `loading.tsx`, `error.tsx`, `not-found.tsx`; route-level loading for `/dashboard` and `/jobs` |
| **Part Tags** | `TagEditor.tsx` — keyboard-driven tag input with suggestions; `PUT /api/jobs/[jobId]/tags` |
| **Public Share Links** | `SharePanel.tsx` — toggle switch generates a UUID token; `/share/[token]` public page with download buttons |
| **Admin Dashboard** | `/admin` — platform stats, plan/status breakdowns, user table, job table, full owner setup guide |

---

## Files Changed (key additions)

```
apps/cad-worker/
  Dockerfile                          ← multi-stage CadQuery build
  app/generators/flat_bracket.py
  app/generators/standoff_block.py
  app/generators/adapter_bushing.py
  app/generators/simple_jig.py
  app/schemas/printer_profile.py
  app/utils/print_time.py
  tests/test_new_generators.py

apps/web/
  app/(marketing)/page.tsx            ← landing page rewrite
  app/admin/page.tsx                  ← admin dashboard
  app/api/admin/system-health/        ← health check API
  app/api/billing/{checkout,portal,webhook}/
  app/api/jobs/[jobId]/{approve,generate,print-result,revise,feedback,share,tags}/
  app/api/settings/printer-profile/
  app/api/webhooks/job-status/
  app/billing/success/page.tsx
  app/pricing/page.tsx
  app/settings/printer/page.tsx
  app/share/[token]/page.tsx          ← public share page (no login)
  app/{loading,error,not-found}.tsx
  app/dashboard/loading.tsx
  app/jobs/loading.tsx
  components/StlViewer.tsx
  components/SystemStatusBar.tsx
  components/SharePanel.tsx
  components/TagEditor.tsx
  components/billing/PricingCards.tsx
  components/jobs/RevisionPanel.tsx
  components/jobs/PrintFeedbackForm.tsx
  components/settings/PrinterProfileForm.tsx
  lib/email/resend.ts
  lib/stripe/config.ts
  public/icons/{apple-touch-icon,favicon-32,icon-192,icon-512}.png

packages/db/migrations/
  001_printer_profiles.sql
  002_print_feedback.sql
  003_tags_and_sharing.sql

.github/workflows/deploy-cad-worker.yml
```

---

## Setup Checklist

### 1. Vercel Environment Variables

Add these in **Vercel → Project → Settings → Environment Variables**:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_MAKER_PRICE_ID
STRIPE_PRO_PRICE_ID
RESEND_API_KEY
RESEND_FROM_EMAIL
ADMIN_EMAIL                  ← your email for /admin access
```

### 2. Database Migrations

Run in order via **Supabase → SQL Editor**:

```sql
-- 1. packages/db/schema.sql          (base schema — skip if already applied)
-- 2. packages/db/migrations/001_printer_profiles.sql
-- 3. packages/db/migrations/002_print_feedback.sql
-- 4. packages/db/migrations/003_tags_and_sharing.sql
```

### 3. Stripe Setup

1. Create **Maker** product ($9/mo) and **Pro** product ($29/mo) in Stripe Dashboard
2. Copy Price IDs → `STRIPE_MAKER_PRICE_ID`, `STRIPE_PRO_PRICE_ID`
3. Add webhook endpoint: `https://your-domain.vercel.app/api/billing/webhook`
4. Subscribe to events: `checkout.session.completed`, `customer.subscription.created/updated/deleted`
5. Copy signing secret → `STRIPE_WEBHOOK_SECRET`

### 4. CAD Worker (Cloud Run)

Add these as **GitHub repository secrets** to enable the CI/CD workflow:

```
GCP_PROJECT_ID       ← your GCP project ID
GCP_SA_KEY           ← base64-encoded service account JSON with Cloud Run + GCR permissions
```

Then push to `master` — the workflow will build and deploy automatically.

**Manual deploy:**
```bash
cd apps/cad-worker
docker build -t gcr.io/YOUR_PROJECT/cad-worker .
docker push gcr.io/YOUR_PROJECT/cad-worker
gcloud run deploy cad-worker \
  --image gcr.io/YOUR_PROJECT/cad-worker \
  --platform managed --region us-central1 \
  --set-env-vars SUPABASE_URL=...,SUPABASE_SERVICE_ROLE_KEY=...
```

### 5. Resend Email

1. Create account at [resend.com](https://resend.com)
2. Add and verify your sending domain
3. Copy API key → `RESEND_API_KEY`
4. Set `RESEND_FROM_EMAIL` to a verified address (e.g. `noreply@yourdomain.com`)

---

## Smoke Test Sequence

| # | Test | Expected |
|---|---|---|
| 1 | Sign up at `/signup` | Account created, redirected to dashboard |
| 2 | Create a part at `/jobs/new` | Job appears in dashboard with `pending` status |
| 3 | Check `/api/admin/system-health` | JSON with all services listed |
| 4 | Open job detail → Tags section | TagEditor renders, can add/remove tags |
| 5 | Open job detail → Share section | Toggle generates a `/share/[token]` URL |
| 6 | Visit `/share/[token]` without login | Part spec and download buttons visible |
| 7 | Visit `/pricing` | Three plan cards, Stripe checkout works (test card `4242 4242 4242 4242`) |
| 8 | After subscribing, check Supabase `profiles` | `plan` column updated to `maker` or `pro` |
| 9 | Visit `/admin` as `ADMIN_EMAIL` user | Stats, user table, job table visible |
| 10 | Visit `/admin` as non-admin | Redirected to `/dashboard` |

---

## Notes

- The **CAD worker CI** will fail until `GCP_PROJECT_ID` and `GCP_SA_KEY` secrets are added to the GitHub repo — this is expected and documented.
- The **Vercel deployment** is triggered automatically by the GitHub push via the existing Vercel Git integration.
- All new API routes under `/api/jobs/[jobId]/` use the unified `[jobId]` slug (the old `[id]` slug conflict has been resolved).
- `tsc --noEmit` and `next build` both pass cleanly with zero errors.
