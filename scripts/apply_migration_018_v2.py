"""Apply migration 018 (router_log) via Supabase Management API v1 SQL endpoint."""
import requests
import json

MIGRATION_TOKEN = "sbp_cd8e98f0a267c20dedde594987f21a611cf7c230"
PROJECT_REF = "lphtdosxneplxgkygjom"

# Supabase Management API SQL endpoint
# https://supabase.com/docs/reference/api/v1-run-query
url = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"

headers = {
    "Authorization": f"Bearer {MIGRATION_TOKEN}",
    "Content-Type": "application/json",
}

# Split into separate statements for compatibility
statements = [
    """
    CREATE TABLE IF NOT EXISTS router_log (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      raw_input       TEXT NOT NULL,
      routed_family   TEXT,
      confidence      INTEGER CHECK (confidence >= 0 AND confidence <= 100),
      ai_explanation  TEXT,
      user_accepted   BOOLEAN NOT NULL DEFAULT false,
      final_family    TEXT
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_router_log_routed_family ON router_log (routed_family)",
    "CREATE INDEX IF NOT EXISTS idx_router_log_created_at ON router_log (created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_router_log_user_accepted ON router_log (user_accepted)",
    "ALTER TABLE router_log ENABLE ROW LEVEL SECURITY",
]

for i, sql in enumerate(statements):
    print(f"\n--- Statement {i+1} ---")
    r = requests.post(url, headers=headers, json={"query": sql.strip()}, timeout=30)
    print(f"Status: {r.status_code}")
    try:
        data = r.json()
        print(json.dumps(data, indent=2)[:300])
    except Exception:
        print(r.text[:300])

# Try to add the policy separately
print("\n--- Policy ---")
policy_sql = """
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'router_log' AND policyname = 'service_role_all'
  ) THEN
    EXECUTE 'CREATE POLICY service_role_all ON router_log FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END $$
"""
r = requests.post(url, headers=headers, json={"query": policy_sql.strip()}, timeout=30)
print(f"Status: {r.status_code}")
try:
    print(json.dumps(r.json(), indent=2)[:300])
except Exception:
    print(r.text[:300])

# Verify table exists
print("\n--- Verify ---")
r = requests.post(url, headers=headers, json={"query": "SELECT table_name FROM information_schema.tables WHERE table_name = 'router_log' AND table_schema = 'public'"}, timeout=30)
print(f"Status: {r.status_code}")
try:
    print(json.dumps(r.json(), indent=2))
except Exception:
    print(r.text[:300])
