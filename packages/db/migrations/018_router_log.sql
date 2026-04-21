-- Migration 018: router_log
-- Stores AI Router decisions for analytics, debugging, and model improvement.
-- Inserted via fire-and-forget from /api/invent (never blocks the main flow).

CREATE TABLE IF NOT EXISTS router_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- The raw user input that was routed
  raw_input       TEXT NOT NULL,

  -- The family the AI router selected (null = unsupported)
  routed_family   TEXT,

  -- AI router confidence score (0–100 integer)
  confidence      INTEGER CHECK (confidence >= 0 AND confidence <= 100),

  -- One-sentence explanation from the AI router
  ai_explanation  TEXT,

  -- Whether the user accepted the router's suggestion and generated a job
  user_accepted   BOOLEAN NOT NULL DEFAULT false,

  -- The final family used (may differ if user edited soft_match dims)
  final_family    TEXT
);

-- Index for analytics queries: most common families, acceptance rates
CREATE INDEX IF NOT EXISTS idx_router_log_routed_family ON router_log (routed_family);
CREATE INDEX IF NOT EXISTS idx_router_log_created_at    ON router_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_router_log_user_accepted ON router_log (user_accepted);

-- RLS: disable for service-role inserts (fire-and-forget from API route)
ALTER TABLE router_log ENABLE ROW LEVEL SECURITY;

-- Service role can insert and read
CREATE POLICY "service_role_all" ON router_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- No public read (analytics data is internal)
