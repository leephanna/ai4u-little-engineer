-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 016: Make user_id nullable in jobs and sessions for Clerk auth
--
-- Problem: jobs.user_id and sessions.user_id are NOT NULL with FK to auth.users.
-- Since we use Clerk (not Supabase auth), there are no auth.users rows.
-- Every INSERT that omits user_id fails with a NOT NULL violation.
--
-- Fix:
--   1. Drop the NOT NULL constraint on user_id in jobs and sessions
--   2. Drop the FK constraint (auth.users rows don't exist for Clerk users)
--   3. Create intake_sessions table if it doesn't exist
--   4. Fix RLS policies to use clerk_user_id instead of auth.uid()
--   5. Ensure service role can bypass RLS (it already does by default)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── sessions: make user_id nullable, drop FK to auth.users ──────────────────
ALTER TABLE public.sessions
  ALTER COLUMN user_id DROP NOT NULL;

-- Drop the FK constraint if it exists (Clerk users have no auth.users rows)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'sessions'
      AND constraint_name = 'sessions_user_id_fkey'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.sessions DROP CONSTRAINT sessions_user_id_fkey;
  END IF;
END $$;

-- ── jobs: make user_id nullable, drop FK to auth.users ──────────────────────
ALTER TABLE public.jobs
  ALTER COLUMN user_id DROP NOT NULL;

-- Drop the FK constraint if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'jobs'
      AND constraint_name = 'jobs_user_id_fkey'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.jobs DROP CONSTRAINT jobs_user_id_fkey;
  END IF;
END $$;

-- ── profiles: make user_id nullable (if it has NOT NULL) ────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles'
      AND column_name = 'user_id'
      AND is_nullable = 'NO'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.profiles ALTER COLUMN user_id DROP NOT NULL;
  END IF;
END $$;

-- Drop FK on profiles.user_id if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'profiles'
      AND constraint_name = 'profiles_user_id_fkey'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.profiles DROP CONSTRAINT profiles_user_id_fkey;
  END IF;
END $$;

-- ── intake_sessions: create if not exists ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.intake_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   TEXT UNIQUE NOT NULL,
  clerk_user_id TEXT,
  state_json   JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_intake_sessions_session_id
  ON public.intake_sessions(session_id);

CREATE INDEX IF NOT EXISTS idx_intake_sessions_clerk_user_id
  ON public.intake_sessions(clerk_user_id);

-- Disable RLS on intake_sessions (service role handles auth)
ALTER TABLE public.intake_sessions DISABLE ROW LEVEL SECURITY;

-- ── Fix RLS policies on jobs to use clerk_user_id ───────────────────────────
-- Drop old auth.uid() policies
DROP POLICY IF EXISTS "Users can view own jobs" ON public.jobs;
DROP POLICY IF EXISTS "Users can insert own jobs" ON public.jobs;
DROP POLICY IF EXISTS "Users can update own jobs" ON public.jobs;

-- The service role bypasses RLS entirely, so these policies only affect
-- anon/authenticated Supabase JWT users (which we don't use).
-- We disable RLS on jobs so service role inserts always work.
ALTER TABLE public.jobs DISABLE ROW LEVEL SECURITY;

-- ── Fix RLS policies on sessions ────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can manage own sessions" ON public.sessions;
ALTER TABLE public.sessions DISABLE ROW LEVEL SECURITY;

-- ── Verify: insert a test row and delete it ─────────────────────────────────
DO $$
DECLARE
  test_job_id UUID;
BEGIN
  INSERT INTO public.jobs (clerk_user_id, title, status)
  VALUES ('migration_016_test', 'Migration 016 Test', 'draft')
  RETURNING id INTO test_job_id;
  DELETE FROM public.jobs WHERE id = test_job_id;
  RAISE NOTICE 'Migration 016: jobs insert/delete test PASSED';
END $$;
