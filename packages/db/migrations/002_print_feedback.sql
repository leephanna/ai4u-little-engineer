-- Migration 002: Print feedback loop
-- Stores user feedback on printed parts to improve future generations.

CREATE TABLE IF NOT EXISTS print_feedback (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  artifact_id   UUID REFERENCES artifacts(id) ON DELETE SET NULL,

  -- Ratings (1–5 stars)
  fit_rating    SMALLINT CHECK (fit_rating BETWEEN 1 AND 5),
  quality_rating SMALLINT CHECK (quality_rating BETWEEN 1 AND 5),
  overall_rating SMALLINT NOT NULL CHECK (overall_rating BETWEEN 1 AND 5),

  -- Outcome
  printed_successfully BOOLEAN NOT NULL DEFAULT true,
  failure_reason       TEXT,    -- e.g. "warped", "too tight", "wrong dimensions"

  -- Free-form notes
  notes         TEXT,

  -- Printer context (snapshot at time of feedback)
  printer_name  TEXT,
  material      TEXT,
  layer_height_mm NUMERIC(4,2),

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: users can only see and insert their own feedback
ALTER TABLE print_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own feedback"
  ON print_feedback FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own feedback"
  ON print_feedback FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own feedback"
  ON print_feedback FOR UPDATE
  USING (auth.uid() = user_id);

-- Index for fast job-level lookups
CREATE INDEX IF NOT EXISTS idx_print_feedback_job_id ON print_feedback(job_id);
CREATE INDEX IF NOT EXISTS idx_print_feedback_user_id ON print_feedback(user_id);

-- Migration 002b: Add Stripe and plan columns to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS subscription_status TEXT,
  ADD COLUMN IF NOT EXISTS plan_activated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS generations_this_month INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS generation_month TEXT; -- 'YYYY-MM' for reset tracking
