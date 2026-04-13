# AI4U Little Engineer — Manual Configuration Steps

> **IMPORTANT:** Auth is now handled by **Clerk**, not Supabase. Do NOT configure Google OAuth in Supabase.
> See `docs/CANONICAL_INFRA.md` for the single source of truth on all infrastructure targets.

---

## 1. Database Migrations

These migrations must be run manually in the Supabase SQL Editor because the sandbox cannot reach the Supabase DB directly.

**Target Supabase Project:** `pgczzapuxtclakoqgyht` (AI4U LITTLE ENGINEER PROD — under AI4U Org)
**Dashboard URL:** `https://supabase.com/dashboard/project/pgczzapuxtclakoqgyht`

Run all migration files in order from `packages/db/migrations/` in the Supabase SQL Editor.

### Migration 012: Clarify Fail Count

```sql
-- 012_clarify_fail_count.sql
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS clarify_fail_count integer DEFAULT 0 NOT NULL;
```

### Migration 013: Job Capability Fields

```sql
-- 013_job_capability_fields.sql
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS capability_id text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS truth_label text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS truth_result jsonb;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS is_demo_preset boolean DEFAULT false NOT NULL;
```

### Migration 014: Clerk Auth IDs (**REQUIRED — run this now**)

Paste the full contents of `packages/db/migrations/014_clerk_auth.sql` into the SQL Editor and run it.

This adds `clerk_user_id TEXT` columns to all user-linked tables so the app can associate Clerk user IDs with database records.

---

## 2. Google OAuth Configuration

**Google OAuth is now managed entirely by Clerk.** Do NOT configure Google OAuth in Supabase.

To enable Google sign-in via Clerk:

1. Go to the [Clerk Dashboard](https://dashboard.clerk.com/) and select your application.
2. Navigate to **User & Authentication > Social Connections**.
3. Enable **Google** and follow the prompts to add your Google OAuth credentials.
4. In Google Cloud Console, add the **Authorized redirect URI** that Clerk provides (format: `https://accounts.clerk.dev/v1/oauth_callback`).

**Do NOT add any `supabase.co/auth/v1/callback` URL to Google Cloud Console.** That path is no longer used.

---

## 3. Vercel Environment Variables

Ensure the following are set in the Vercel project (`ai4u-little-engineer`):

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://pgczzapuxtclakoqgyht.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | *(anon key from AI4U ORG project)* |
| `SUPABASE_SERVICE_ROLE_KEY` | *(service role key from AI4U ORG project)* |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_test_...` *(upgrade to `pk_live_` before launch)* |
| `CLERK_SECRET_KEY` | `sk_test_...` *(upgrade to `sk_live_` before launch)* |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/sign-up` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | `/invent` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` | `/invent` |

---

## 4. Verification

After completing these steps:

1. Verify that `014_clerk_auth.sql` ran successfully — check that the `profiles` table has a `clerk_user_id` column.
2. Visit `https://ai4u-little-engineer-web.vercel.app/sign-in` — the Clerk sign-in widget should appear.
3. Click "Continue with Google" — it should redirect to Google OAuth via Clerk (URL will contain `clerk.com`, NOT `supabase.co`).
4. After sign-in, you should be redirected to `/invent`.
5. Visit `/dashboard` without being signed in — you should be redirected to `/sign-in`.

---

## ⚠️ Deleted / Stale Project References

The following Supabase project references are **obsolete and must not be used**:

| Stale URL | Status |
|-----------|--------|
| `https://lphtdosxneplxgkyjgom.supabase.co` | Old project — deleted or abandoned |
| `https://nghxnzmkvxsbtqhnnzha.supabase.co` | Free-tier duplicate — deleted |

If you see either of these URLs anywhere in code, config, or env vars, replace them with `https://pgczzapuxtclakoqgyht.supabase.co`.

*Last updated: 2026-04-13 by Manus (Clerk auth cutover + Supabase canonicalization)*
