-- Migration 015: Intake Sessions — Clerk Auth
-- Creates intake_sessions table using clerk_user_id (TEXT) instead of
-- auth.users UUID FK, which was broken after Clerk migration.
-- Also adds clarify_fail_count column (previously in migration 012 which
-- targeted the old table structure).

CREATE TABLE IF NOT EXISTS intake_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Current interpretation state
  mode TEXT,
  family_candidate TEXT,
  extracted_dimensions JSONB DEFAULT '{}'::jsonb,
  fit_envelope JSONB DEFAULT NULL,
  inferred_scale TEXT,
  inferred_object_type TEXT,
  missing_information TEXT[],
  assistant_message TEXT,
  preview_strategy TEXT,
  confidence FLOAT DEFAULT 0,
  clarify_fail_count INTEGER NOT NULL DEFAULT 0,

  -- Conversation history (array of {role, content} objects)
  conversation_history JSONB DEFAULT '[]'::jsonb,

  -- Linked job (set once the user confirms and generation starts)
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,

  -- Status
  status TEXT NOT NULL DEFAULT 'active'  -- active | confirmed | abandoned
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_intake_sessions_clerk_user_id ON intake_sessions(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_intake_sessions_status ON intake_sessions(status);
CREATE INDEX IF NOT EXISTS idx_intake_sessions_created ON intake_sessions(created_at DESC);

-- RLS: disabled — all access via service role key (bypasses RLS)
ALTER TABLE intake_sessions DISABLE ROW LEVEL SECURITY;
