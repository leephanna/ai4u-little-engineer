# AI4U Little Engineer — Owner Action Checklist

> **Status:** Beta Hardening Pass — Track 3  
> **Date:** April 2026  
> **Purpose:** Every item in this document requires a manual action by the project owner before the app is production-ready. Items are grouped by service and ordered by priority.

---

## 1. Clerk Authentication

| Item | Status | Action Required |
|---|---|---|
| `CLERK_SECRET_KEY` | `sk_test_*` — **dev key** | Switch to live key in Vercel env vars |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_test_*` — **dev key** | Switch to live key in Vercel env vars |
| Clerk Production Instance | Not created | Create a Production instance in the [Clerk Dashboard](https://dashboard.clerk.com) |
| Email verification | Unknown | Enable in Clerk Dashboard → User & Authentication → Email |
| Social OAuth (Google, GitHub) | Unknown | Enable and configure in Clerk Dashboard → Social Connections |

**Steps to switch to Clerk Production:**
1. Go to [Clerk Dashboard](https://dashboard.clerk.com) → your app → **Production** tab
2. Copy `CLERK_SECRET_KEY` (starts with `sk_live_`) and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (starts with `pk_live_`)
3. In [Vercel Dashboard](https://vercel.com) → Project Settings → Environment Variables:
   - Add/update `CLERK_SECRET_KEY` = `sk_live_...`
   - Add/update `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` = `pk_live_...`
4. Redeploy

---

## 2. Stripe Billing

| Item | Status | Action Required |
|---|---|---|
| `STRIPE_SECRET_KEY` | **Missing from Vercel** | Add to Vercel env vars |
| `STRIPE_WEBHOOK_SECRET` | **Missing from Vercel** | Add after creating webhook endpoint |
| `STRIPE_PRICE_ID_MAKER` | **Missing from Vercel** | Create Maker plan price in Stripe, add ID |
| `STRIPE_PRICE_ID_PRO` | **Missing from Vercel** | Create Pro plan price in Stripe, add ID |
| Stripe webhook endpoint | **Not configured** | Create in Stripe Dashboard |

**Steps to configure Stripe:**
1. Go to [Stripe Dashboard](https://dashboard.stripe.com) → Products → Create two products:
   - **Maker Plan** — monthly subscription, e.g. $9/month → copy Price ID (`price_...`)
   - **Pro Plan** — monthly subscription, e.g. $29/month → copy Price ID (`price_...`)
2. Go to Stripe Dashboard → Developers → Webhooks → Add endpoint:
   - URL: `https://ai4u-little-engineer-web.vercel.app/api/billing/webhook`
   - Events to listen: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
   - Copy the webhook signing secret (`whsec_...`)
3. In Vercel Dashboard → Environment Variables, add:
   - `STRIPE_SECRET_KEY` = `sk_live_...` (or `sk_test_...` for testing)
   - `STRIPE_WEBHOOK_SECRET` = `whsec_...`
   - `STRIPE_PRICE_ID_MAKER` = `price_...` (Maker plan)
   - `STRIPE_PRICE_ID_PRO` = `price_...` (Pro plan)
4. Redeploy

> **Note:** Until `STRIPE_SECRET_KEY` is set, the `/api/billing/checkout` route will return 500 errors. The rest of the app functions normally without billing.

---

## 3. OpenAI API Key

| Item | Status | Action Required |
|---|---|---|
| `OPENAI_API_KEY` (Vercel — web app) | **Missing** | Add to Vercel env vars |
| `OPENAI_API_KEY` (Render — CAD worker) | **Set** ✓ | Done — set manually in Render dashboard |

**Steps to add OpenAI key to Vercel:**
1. Go to [Vercel Dashboard](https://vercel.com) → Project Settings → Environment Variables
2. Add `OPENAI_API_KEY` = `sk-...`
3. Redeploy

> **Note:** The web app's AI router (`/lib/ai-router.ts`) uses `OPENAI_API_KEY` for the LLM routing call. Without it, the router falls back to the legacy interpret path. The CAD worker already has the key set.

---

## 4. CAD Worker URL

| Item | Status | Action Required |
|---|---|---|
| `CAD_WORKER_URL` (Vercel) | **Missing** | Add to Vercel env vars |
| `NEXT_PUBLIC_CAD_WORKER_URL` (Vercel) | **Missing** | Add to Vercel env vars |

**Steps:**
1. In Vercel Dashboard → Environment Variables, add:
   - `CAD_WORKER_URL` = `https://ai4u-cad-worker.onrender.com`
   - `NEXT_PUBLIC_CAD_WORKER_URL` = `https://ai4u-cad-worker.onrender.com`
2. Redeploy

> **Note:** The invent route has a hardcoded fallback to `https://ai4u-cad-worker.onrender.com` when `CAD_WORKER_URL` is not set, so custom generation works even without this var. Setting it explicitly is recommended for production.

---

## 5. Admin Bypass Key

| Item | Status | Action Required |
|---|---|---|
| `ADMIN_BYPASS_KEY` (Vercel) | **Set** ✓ | Already configured in Vercel |

No action required.

---

## 6. Supabase Storage Bucket

| Item | Status | Action Required |
|---|---|---|
| `cad-artifacts` bucket | Unknown | Verify bucket exists and has correct RLS policies |
| Signed URL expiry | 3600s (1 hour) | Acceptable for beta — increase for production if needed |

**Steps to verify:**
1. Go to [Supabase Dashboard](https://supabase.com/dashboard) → Storage
2. Confirm `cad-artifacts` bucket exists
3. Check RLS policies: service role should have full access; anon role should have no access
4. Test: generate a custom shape and confirm the 3D viewer loads (signed URL working)

---

## 7. Render CAD Worker

| Item | Status | Action Required |
|---|---|---|
| Service tier | **Free tier** | Upgrade to Starter ($7/month) to eliminate cold starts |
| `OPENAI_API_KEY` | **Set** ✓ | Done |
| Auto-deploy from GitHub | Unknown | Enable in Render Dashboard → Settings → Auto-Deploy |

**Cold start impact:** On the free tier, the CAD worker sleeps after 15 minutes of inactivity. The first request after sleep takes 30-90 seconds. This causes `custom_generate_failed` errors for gallery items. Upgrading to Starter eliminates this.

---

## 8. Pre-Launch Checklist

Before going live, confirm all of the following:

- [ ] Clerk: switched to Production instance (`pk_live_*` / `sk_live_*`)
- [ ] Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_MAKER`, `STRIPE_PRICE_ID_PRO` all set in Vercel
- [ ] OpenAI: `OPENAI_API_KEY` set in Vercel
- [ ] CAD Worker: `CAD_WORKER_URL` set in Vercel
- [ ] Render: upgraded to Starter tier (no cold starts)
- [ ] Supabase: `cad-artifacts` bucket verified with correct RLS
- [ ] Custom domain: configured in Vercel (optional)
- [ ] Error monitoring: Sentry or similar configured (optional but recommended)
- [ ] Rate limiting: review `/api/invent` rate limits for production load
