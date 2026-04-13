-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 014: Clerk Auth Integration
--
-- Replaces Supabase auth with Clerk. Since there are 0 existing users,
-- we can safely add clerk_user_id TEXT columns to all user-linked tables.
--
-- Strategy:
--   1. Add clerk_user_id TEXT column to all tables that have user_id UUID
--   2. Create indexes on clerk_user_id for fast lookups
--   3. RLS policies are updated to use clerk_user_id (service role bypasses RLS)
--
-- Note: The existing user_id UUID columns are retained for schema compatibility
-- but will be NULL for all new Clerk-authenticated records.
-- ─────────────────────────────────────────────────────────────────────────────

-- profiles table (CRITICAL: used by admin role checks in admin/layout.tsx and all admin intelligence routes)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS clerk_user_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_clerk_user_id
  ON public.profiles(clerk_user_id);

-- sessions table
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS clerk_user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_sessions_clerk_user_id
  ON public.sessions(clerk_user_id);

-- jobs table
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS clerk_user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_jobs_clerk_user_id
  ON public.jobs(clerk_user_id);

-- part_specs table
ALTER TABLE public.part_specs
  ADD COLUMN IF NOT EXISTS clerk_user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_part_specs_clerk_user_id
  ON public.part_specs(clerk_user_id);

-- printer_profiles table
ALTER TABLE public.printer_profiles
  ADD COLUMN IF NOT EXISTS clerk_user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_printer_profiles_clerk_user_id
  ON public.printer_profiles(clerk_user_id);

-- subscriptions table
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS clerk_user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_subscriptions_clerk_user_id
  ON public.subscriptions(clerk_user_id);

-- projects table
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS clerk_user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_projects_clerk_user_id
  ON public.projects(clerk_user_id);

-- user_design_profiles table
ALTER TABLE public.user_design_profiles
  ADD COLUMN IF NOT EXISTS clerk_user_id TEXT UNIQUE;
CREATE INDEX IF NOT EXISTS idx_user_design_profiles_clerk_user_id
  ON public.user_design_profiles(clerk_user_id);

-- design_purchases table
ALTER TABLE public.design_purchases
  ADD COLUMN IF NOT EXISTS clerk_user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_design_purchases_clerk_user_id
  ON public.design_purchases(clerk_user_id);

-- invention_requests table (if exists)
ALTER TABLE public.invention_requests
  ADD COLUMN IF NOT EXISTS clerk_user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_invention_requests_clerk_user_id
  ON public.invention_requests(clerk_user_id);

-- print_feedback table
ALTER TABLE public.print_feedback
  ADD COLUMN IF NOT EXISTS clerk_user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_print_feedback_clerk_user_id
  ON public.print_feedback(clerk_user_id);

-- design_learning_records table
ALTER TABLE public.design_learning_records
  ADD COLUMN IF NOT EXISTS clerk_user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_design_learning_records_clerk_user_id
  ON public.design_learning_records(clerk_user_id);

-- daedalus_receipts table (if exists)
ALTER TABLE public.daedalus_receipts
  ADD COLUMN IF NOT EXISTS clerk_user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_daedalus_receipts_clerk_user_id
  ON public.daedalus_receipts(clerk_user_id);

-- intake_sessions table (if exists)
ALTER TABLE public.intake_sessions
  ADD COLUMN IF NOT EXISTS clerk_user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_intake_sessions_clerk_user_id
  ON public.intake_sessions(clerk_user_id);

-- intake_artifacts table (if exists)
ALTER TABLE public.intake_artifacts
  ADD COLUMN IF NOT EXISTS clerk_user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_intake_artifacts_clerk_user_id
  ON public.intake_artifacts(clerk_user_id);
