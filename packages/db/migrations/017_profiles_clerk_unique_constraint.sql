-- Migration 017: Add UNIQUE CONSTRAINT on profiles.clerk_user_id
-- 
-- Migration 014 created a UNIQUE INDEX on profiles.clerk_user_id, but
-- Supabase's .upsert({ onConflict: "clerk_user_id" }) requires a UNIQUE CONSTRAINT
-- (not just a unique index). This migration adds the constraint using the existing index.
--
-- Also adds UNIQUE CONSTRAINT on intake_sessions.session_id for the same reason.

-- 1. Drop the unique index and replace with a unique constraint on profiles
DO $$
BEGIN
  -- Add unique constraint if not already present
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_clerk_user_id_unique'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_clerk_user_id_unique UNIQUE (clerk_user_id);
  END IF;
END $$;

-- 2. Add unique constraint on intake_sessions.session_id if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'intake_sessions_session_id_unique'
      AND conrelid = 'public.intake_sessions'::regclass
  ) THEN
    ALTER TABLE public.intake_sessions
      ADD CONSTRAINT intake_sessions_session_id_unique UNIQUE (session_id);
  END IF;
END $$;
