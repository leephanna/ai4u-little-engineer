-- Migration 003: Part family tags and share/export features
-- Phase 3C: Part family tags
-- Phase 3D: Share/export (public share token)

-- Add tags array to jobs table
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

-- Add public share token (null = private, UUID string = public)
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS share_token TEXT UNIQUE;

-- Index for fast tag filtering
CREATE INDEX IF NOT EXISTS idx_jobs_tags ON public.jobs USING GIN (tags);

-- Index for share token lookup
CREATE INDEX IF NOT EXISTS idx_jobs_share_token ON public.jobs (share_token)
  WHERE share_token IS NOT NULL;

-- Allow public read access to shared jobs (RLS policy)
-- Assumes RLS is enabled on jobs table
DO $$
BEGIN
  -- Drop old policy if exists to recreate
  DROP POLICY IF EXISTS "Public can view shared jobs" ON public.jobs;
  
  CREATE POLICY "Public can view shared jobs"
    ON public.jobs
    FOR SELECT
    USING (share_token IS NOT NULL);
EXCEPTION WHEN OTHERS THEN
  NULL; -- RLS may not be enabled; skip
END $$;
