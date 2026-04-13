# AI4U Little Engineer — Canonical Infrastructure Reference

> **This document is the single source of truth for all backend targets.**
> If you are unsure which Supabase project, Vercel project, or auth provider to use, read this file first.

---

## Canonical Supabase Project

| Field | Value |
|-------|-------|
| **Project Name** | AI4U LITTLE ENGINEER PROD |
| **Organization** | AI4U Org (PRO tier) |
| **Project URL** | `https://pgczzapuxtclakoqgyht.supabase.co` |
| **Project Ref** | `pgczzapuxtclakoqgyht` |
| **Region** | AWS us-east-1 (North Virginia) |
| **Plan** | NANO on PRO org |
| **GitHub Link** | `leephanna/ai4u-little-engineer` |

**This is the only Supabase project for AI4U Little Engineer.**

---

## Deleted / Mistaken Project (DO NOT USE)

| Field | Value |
|-------|-------|
| **Project Name** | supabase-little-engineer *(deleted)* |
| **Organization** | LEE HANNA's projects (FREE tier) |
| **Project URL** | `https://nghxnzmkvxsbtqhnnzha.supabase.co` *(inactive)* |
| **Why deleted** | Free-tier duplicate, zero migrations, zero data, never referenced by production |

**Do not create any new projects under "LEE HANNA's projects" org for this app.**

---

## Canonical Auth Provider

| Field | Value |
|-------|-------|
| **Provider** | Clerk |
| **Mode** | Development (test keys) — upgrade to production keys before launch |
| **Sign-in URL** | `/sign-in` |
| **Sign-up URL** | `/sign-up` |
| **After sign-in** | `/invent` |
| **After sign-up** | `/invent` |

**Supabase Auth is NOT used for user authentication.** Clerk handles all sign-in, sign-up, Google OAuth, and session management. Supabase is used only as the database (service role client, RLS bypassed).

---

## Canonical Vercel Project

| Field | Value |
|-------|-------|
| **Project Name** | ai4u-little-engineer |
| **Production URL** | `https://ai4u-little-engineer-web.vercel.app` |
| **Team** | Lee Hanna's projects |
| **Linked Repo** | `leephanna/ai4u-little-engineer` (master branch) |

---

## Environment Variables (Vercel Production)

All of the following must be set in the Vercel project environment:

```
NEXT_PUBLIC_SUPABASE_URL=https://pgczzapuxtclakoqgyht.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from AI4U ORG project>
SUPABASE_SERVICE_ROLE_KEY=<service role key from AI4U ORG project>
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...  (upgrade to pk_live_ for production)
CLERK_SECRET_KEY=sk_test_...                   (upgrade to sk_live_ for production)
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/invent
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/invent
```

---

## DB Migration Status

| Migration | File | Status |
|-----------|------|--------|
| 001–013 | `packages/db/migrations/001_*.sql` … `013_*.sql` | Must be run in Supabase SQL Editor |
| 014 | `packages/db/migrations/014_clerk_auth.sql` | **Must be run — adds `clerk_user_id TEXT` to all user tables** |

**Run all migrations in the Supabase SQL Editor for project `pgczzapuxtclakoqgyht` (AI4U LITTLE ENGINEER PROD).**

---

## What NOT to do

- **Do NOT** create a new Supabase project under "LEE HANNA's projects" for this app
- **Do NOT** use `nghxnzmkvxsbtqhnnzha.supabase.co` — this project has been deleted
- **Do NOT** re-enable Supabase Auth (signInWithOAuth, magic links via Supabase) — Clerk handles auth
- **Do NOT** add `href="/login"` or `href="/signup"` links — use `/sign-in` and `/sign-up`
- **Do NOT** use `supabase.auth.getUser()` in new code — use `getAuthUser()` from `lib/auth.ts`

---

*Last updated: 2026-04-13 by Manus (Clerk auth cutover + Supabase canonicalization)*
