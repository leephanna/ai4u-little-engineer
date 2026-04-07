-- Migration 013: Job Capability Fields
-- Adds Truth Gate metadata columns to the jobs table so every job
-- carries a record of which capability was selected, what the Truth Gate
-- decided, and whether the job originated from a demo preset.
--
-- These columns are written by /api/invent and /api/demo/artemis on job creation.
-- They are read by the job detail page to surface the truth label and by the
-- capability registry analytics to track per-capability success rates.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS capability_id   TEXT,
  ADD COLUMN IF NOT EXISTS truth_label     TEXT,
  ADD COLUMN IF NOT EXISTS truth_result    JSONB,
  ADD COLUMN IF NOT EXISTS is_demo_preset  BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for analytics queries: "how many jobs per capability?"
CREATE INDEX IF NOT EXISTS idx_jobs_capability_id ON jobs (capability_id);

-- Index for filtering demo vs real jobs
CREATE INDEX IF NOT EXISTS idx_jobs_is_demo_preset ON jobs (is_demo_preset);

COMMENT ON COLUMN jobs.capability_id IS
  'Capability registry ID that was selected for this job (e.g. primitive_spacer_v1)';
COMMENT ON COLUMN jobs.truth_label IS
  'Truth Gate label assigned at job creation: VERIFIED | CONCEPT_ONLY | EXPERIMENTAL | UNSUPPORTED';
COMMENT ON COLUMN jobs.truth_result IS
  'Full Truth Gate receipt JSON including verdict, reason, gates_passed, gates_failed';
COMMENT ON COLUMN jobs.is_demo_preset IS
  'TRUE if this job was created from a locked demo preset (e.g. Artemis II), FALSE for user-created jobs';
