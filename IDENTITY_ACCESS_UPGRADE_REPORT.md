# Identity & Access Upgrade Report
**Commit:** `6804a4d` → pushed to `origin/master`  
**Date:** 2026-04-03  
**Compliance:** TypeScript 3/3 ✓ | ESLint 0 errors ✓ | pytest 257/257 ✓ | jest 20/20 ✓

---

## Summary

This upgrade implements a production-safe, layered identity and access system for AI4U Little Engineer. It introduces Google sign-in as the first-class authentication path, a centralized access policy module, owner-unlimited quota bypass, a secure fallback unlock flow, and correct UI reflection of unlimited status.

---

## Deliverables

### 1. Centralized Access Policy Module
**File:** `apps/web/lib/access-policy.ts`

Single source of truth for all bypass decisions. Priority order:

| Priority | Method | Trigger | Reason String |
|---|---|---|---|
| 1 | Owner email | `OWNER_EMAILS` env var (comma-separated) or hardcoded `leehanna8@gmail.com` | `owner_email` |
| 2 | HttpOnly bypass cookie | Cookie name from `OWNER_BYPASS_COOKIE_NAME`, value must match `ADMIN_BYPASS_KEY` | `owner_cookie` |
| 3 | Admin bypass header | `x-admin-bypass-key` header must match `ADMIN_BYPASS_KEY` | `admin_header` |
| 4 | Preview unlimited | `PREVIEW_UNLIMITED=true` env var | `preview_unlimited` |
| 5 | Normal limits | All above conditions absent | `null` (no bypass) |

**Exported functions:**
- `shouldBypassLimits(userEmail?)` → `Promise<{ bypassed: boolean; reason: string | null }>`
- `isOwnerEmail(email?)` → `boolean` (pure, synchronous)
- `isPreviewUnlimited()` → `boolean` (pure, synchronous)
- `hasOwnerBypassCookie()` → `Promise<boolean>`
- `hasAdminBypassKey()` → `Promise<boolean>`

---

### 2. Google Sign-In
**Files:** `apps/web/components/auth/GoogleSignInButton.tsx`, `apps/web/app/login/page.tsx`, `apps/web/app/signup/page.tsx`

- `GoogleSignInButton` component uses `supabase.auth.signInWithOAuth({ provider: "google" })` with `access_type: offline` and `prompt: select_account`.
- Login and signup pages now show **"Continue with Google"** / **"Sign up with Google"** as the primary CTA.
- Email/password remains available via a progressive disclosure toggle ("Use email + password instead →").
- Both pages respect `?redirectTo=` and `?redirect=` query params and pass them through the OAuth callback.

**Required Supabase Dashboard step (one-time):**
1. Go to **Authentication → Providers → Google** in your Supabase project.
2. Enable Google provider.
3. Add your Google OAuth Client ID and Secret (from Google Cloud Console).
4. Add `https://<your-domain>/auth/callback` as an authorized redirect URI in Google Cloud Console.

---

### 3. Server-Side Quota Bypass
**Files patched:**
- `apps/web/app/api/demo/artemis/route.ts`
- `apps/web/app/api/invent/route.ts`
- `apps/web/app/api/jobs/[jobId]/generate/route.ts`

Each route now calls `await shouldBypassLimits(user.email)` immediately after auth. If `bypass.bypassed === true`, the billing gate is skipped entirely. The final response includes `unlimited: true` and `bypass_reason` fields for client-side awareness.

---

### 4. Fallback Owner Unlock Flow
**Files:**
- `apps/web/app/api/admin/unlock/route.ts` — `POST` (set cookie) + `DELETE` (clear cookie)
- `apps/web/app/admin/unlock/page.tsx` — UI form at `/admin/unlock`

**How to use:**
1. Navigate to `https://<your-domain>/admin/unlock`
2. Enter the value of `ADMIN_BYPASS_KEY` from your Vercel environment variables
3. Click **Activate Unlimited Access**
4. The server sets an HttpOnly, Secure, SameSite=Strict cookie valid for 24 hours
5. All subsequent requests from that browser session will bypass quota limits
6. Click **Clear bypass cookie** to revoke early

This flow works even when Google OAuth is not yet configured, allowing the owner to test the full platform immediately after deployment.

---

### 5. UI — Unlimited Status Display
**Files patched:** `apps/web/app/dashboard/page.tsx`, `apps/web/app/account/page.tsx`

- Dashboard usage card shows **♾️ Unlimited** with `owner access · <reason>` when bypass is active.
- Account page usage meter shows **♾️ Unlimited (owner access)** and hides the progress bar.
- Normal users continue to see their plan/usage data unchanged.

---

### 6. Unit Tests
**File:** `apps/web/__tests__/access-policy.test.ts`  
**Config:** `apps/web/jest.config.ts`

20 tests across 3 describe blocks:

| Suite | Tests |
|---|---|
| `isOwnerEmail` | 6 tests — hardcoded owner, case-insensitivity, non-owner, null/undefined, OWNER_EMAILS env var, empty OWNER_EMAILS fallback |
| `isPreviewUnlimited` | 4 tests — unset, true, false, non-"true" value |
| `shouldBypassLimits` | 10 tests — each bypass path, wrong key/cookie, null email, priority ordering |

All 20 pass in 0.25s.

---

## Required Environment Variables

Add these to your Vercel project environment variables:

| Variable | Required | Description | Example |
|---|---|---|---|
| `OWNER_EMAILS` | Recommended | Comma-separated list of owner emails that always get unlimited access | `leehanna8@gmail.com` |
| `ADMIN_BYPASS_KEY` | Required for unlock flow | Strong random secret (≥32 chars). Used by `/admin/unlock` and the bypass cookie. | `891p-JU7zTvLfTAGO0we9S9LQd1wKjW33AJYILqQrhk` |
| `OWNER_BYPASS_COOKIE_NAME` | Optional | Cookie name for the bypass cookie. Defaults to `ai4u_owner_bypass`. | `ai4u_owner_bypass` |
| `PREVIEW_UNLIMITED` | Optional | Set to `true` to give ALL authenticated users unlimited access (staging/demo environments only). | `false` |

**Note:** `OWNER_EMAILS` already includes `leehanna8@gmail.com` as a hardcoded fallback, so even without setting this env var, the primary owner email will always bypass limits.

---

## Verification Checklist

After deploying to Vercel:

- [ ] Sign in with Google at `/login` — redirects to `/dashboard` successfully
- [ ] Sign up with Google at `/signup` — creates account and redirects to `/dashboard`
- [ ] As `leehanna8@gmail.com`: generate a part — should succeed even at free plan limit (bypass reason: `owner_email`)
- [ ] Dashboard shows **♾️ Unlimited** for owner email
- [ ] Account page shows **♾️ Unlimited (owner access)** for owner email
- [ ] Navigate to `/admin/unlock`, enter `ADMIN_BYPASS_KEY`, click activate — should show success
- [ ] As a non-owner user at free plan limit: generation returns 402 with `upgrade_required: true`
- [ ] `DELETE /api/admin/unlock` clears the bypass cookie

---

## Compliance Gate Results

| Gate | Result |
|---|---|
| `pnpm typecheck` (3 packages) | ✅ 0 errors |
| `pnpm lint` (Next.js ESLint) | ✅ 0 errors (2 pre-existing warnings, unchanged) |
| `pytest` (CAD worker, 258 tests) | ✅ 257 passed, 1 skipped |
| `jest` (access-policy, 20 tests) | ✅ 20 passed |
