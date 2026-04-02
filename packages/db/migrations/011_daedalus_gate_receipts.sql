-- Migration 011: Daedalus Gate Protocol Receipts
-- Stores structured proof receipts for the full intake → preview → generate path.
-- These receipts are queryable by operators and used for audit/debugging.

-- ── daedalus_receipts table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daedalus_receipts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gate            TEXT NOT NULL,          -- intake_interpretation | harmonia_merge | clarification | preview | vpl | trust | generation
  session_id      UUID REFERENCES intake_sessions(id) ON DELETE SET NULL,
  job_id          UUID REFERENCES jobs(id) ON DELETE SET NULL,
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  timestamp       TIMESTAMPTZ NOT NULL DEFAULT now(),
  elapsed_ms      INTEGER,
  result          TEXT NOT NULL,          -- GO | CLARIFY | REJECT | WARN
  confidence      NUMERIC(4,3),           -- 0.000–1.000
  payload         JSONB NOT NULL DEFAULT '{}',
  notes           TEXT[] NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for operator queries
CREATE INDEX IF NOT EXISTS daedalus_receipts_session_idx ON daedalus_receipts(session_id);
CREATE INDEX IF NOT EXISTS daedalus_receipts_job_idx ON daedalus_receipts(job_id);
CREATE INDEX IF NOT EXISTS daedalus_receipts_user_idx ON daedalus_receipts(user_id);
CREATE INDEX IF NOT EXISTS daedalus_receipts_gate_idx ON daedalus_receipts(gate);
CREATE INDEX IF NOT EXISTS daedalus_receipts_result_idx ON daedalus_receipts(result);
CREATE INDEX IF NOT EXISTS daedalus_receipts_timestamp_idx ON daedalus_receipts(timestamp DESC);

-- RLS: operators can read all; users can read their own
ALTER TABLE daedalus_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "operators_can_read_all_receipts"
  ON daedalus_receipts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'operator'
    )
  );

CREATE POLICY "users_can_read_own_receipts"
  ON daedalus_receipts FOR SELECT
  USING (user_id = auth.uid());

-- Service role bypass (for server-side writes)
CREATE POLICY "service_role_full_access"
  ON daedalus_receipts FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── Add daedalus_receipt_id to intake_sessions ────────────────────────────────
ALTER TABLE intake_sessions
  ADD COLUMN IF NOT EXISTS last_receipt_id UUID REFERENCES daedalus_receipts(id) ON DELETE SET NULL;

-- ── Add daedalus_receipt_id to jobs ───────────────────────────────────────────
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS last_receipt_id UUID REFERENCES daedalus_receipts(id) ON DELETE SET NULL;

COMMENT ON TABLE daedalus_receipts IS
  'Daedalus Gate Protocol: structured proof receipts for the full intake → preview → generate path. '
  'Queryable by operators for audit and debugging. Not shown to end users by default.';
