-- Migration 012: Add clarify_fail_count and fit_envelope to intake_sessions
--
-- Root cause fix for Track 2 hiccup:
-- The clarify route was writing `clarify_fail_count` and `fit_envelope` to
-- intake_sessions but these columns did not exist. Supabase silently returned
-- an error on the UPDATE, which was caught by the outer try/catch and returned
-- a 500 — causing the "Sorry, I had a hiccup" message on every successful turn.

ALTER TABLE intake_sessions
  ADD COLUMN IF NOT EXISTS clarify_fail_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fit_envelope JSONB DEFAULT NULL;

COMMENT ON COLUMN intake_sessions.clarify_fail_count IS
  'Number of consecutive LLM clarify failures. Triggers fallback_form at >= 2.';

COMMENT ON COLUMN intake_sessions.fit_envelope IS
  'Extracted reference object dimensions when user requests derived-fit sizing (e.g. "rocket sized to fit stand").';
