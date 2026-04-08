# AI4U Little Engineer — Manual Configuration Steps

This document outlines the exact manual steps required to configure Google OAuth and apply the necessary database migrations for the AI4U Little Engineer production environment.

## 1. Database Migrations

These migrations must be run manually in the Supabase SQL Editor because the sandbox cannot reach the Supabase DB directly.

**Target Supabase Project:** `lphtdosxneplxgkyjgom`

### Migration 012: Clarify Fail Count
Run the following SQL to add the `clarify_fail_count` column to the `jobs` table:

```sql
-- 012_clarify_fail_count.sql
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS clarify_fail_count integer DEFAULT 0 NOT NULL;
```

### Migration 013: Job Capability Fields
Run the following SQL to add the capability metadata fields to the `jobs` table:

```sql
-- 013_job_capability_fields.sql
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS capability_id text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS truth_label text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS truth_result jsonb;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS is_demo_preset boolean DEFAULT false NOT NULL;
```

## 2. Google OAuth Configuration

Google OAuth requires configuration in both the Google Cloud Console and the Supabase Dashboard.

### Step 2.1: Google Cloud Console

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Select your project (or create a new one for AI4U Little Engineer).
3. Navigate to **APIs & Services > Credentials**.
4. Click **Create Credentials > OAuth client ID**.
5. Select **Web application** as the Application type.
6. Name it something like "AI4U Little Engineer Web".
7. Under **Authorized JavaScript origins**, add:
   - `https://ai4u-little-engineer-web.vercel.app`
   - `http://localhost:3000` (for local development)
8. Under **Authorized redirect URIs**, add the exact Supabase callback URL:
   - `https://lphtdosxneplxgkyjgom.supabase.co/auth/v1/callback`
9. Click **Create**.
10. Copy the **Client ID** and **Client Secret**.

### Step 2.2: Supabase Dashboard

1. Go to the [Supabase Dashboard](https://app.supabase.com/) and select project `lphtdosxneplxgkyjgom`.
2. Navigate to **Authentication > Providers**.
3. Find **Google** and click to enable it.
4. Paste the **Client ID** and **Client Secret** obtained from Google Cloud Console.
5. Ensure the **Callback URL (for OAuth)** matches exactly: `https://lphtdosxneplxgkyjgom.supabase.co/auth/v1/callback`.
6. Click **Save**.

### Step 2.3: Vercel Environment Variables

Ensure the following environment variables are set in your Vercel project (`quantum-frontiers-ai4u`):

- `NEXT_PUBLIC_SUPABASE_URL`: `https://lphtdosxneplxgkyjgom.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: (Your Supabase anon key)
- `ADMIN_BYPASS_KEY`: (If not already set, generate a secure random string for admin access)

The post-auth redirect target is already configured in the code to route users to `/invent` after successful login.

## 3. Verification

After completing these steps:
1. Verify that the `jobs` table in Supabase has the new columns (`clarify_fail_count`, `capability_id`, `truth_label`, `truth_result`, `is_demo_preset`).
2. Test the Google Sign-In flow on the production URL (`https://ai4u-little-engineer-web.vercel.app`).
3. Verify that after successful login, you are redirected to `/invent`.
4. Test the Truth Gate lockout path by attempting to generate an experimental capability (e.g., "gear" or "propeller"). It should return a "concept_preview" label and not attempt to generate an STL.
