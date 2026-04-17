#!/usr/bin/env python3
"""Apply migration 015 via Supabase REST API using the pg_execute RPC or direct SQL."""
import os, requests, json

SUPABASE_URL = "https://lphtdosxneplxgkygjom.supabase.co"
SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwaHRkb3N4bmVwbHhna3lnam9tIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc5MDczNSwiZXhwIjoyMDg5MzY2NzM1fQ.WWLgOOm0QsOnHrbz8TyVZNKWnEpKlNM0365hB4q_gH4"

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
}

# Split into individual statements to avoid issues
STATEMENTS = [
    """
CREATE TABLE IF NOT EXISTS intake_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
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
  conversation_history JSONB DEFAULT '[]'::jsonb,
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active'
)
""",
    "CREATE INDEX IF NOT EXISTS idx_intake_sessions_clerk_user_id ON intake_sessions(clerk_user_id)",
    "CREATE INDEX IF NOT EXISTS idx_intake_sessions_status ON intake_sessions(status)",
    "CREATE INDEX IF NOT EXISTS idx_intake_sessions_created ON intake_sessions(created_at DESC)",
    "ALTER TABLE intake_sessions DISABLE ROW LEVEL SECURITY",
]

def run_sql(sql: str) -> dict:
    """Execute SQL via Supabase's pg RPC endpoint."""
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/rpc/exec_sql",
        headers=HEADERS,
        json={"query": sql},
        timeout=30,
    )
    return {"status": resp.status_code, "body": resp.text}

def run_sql_via_postgres(sql: str) -> dict:
    """Try the postgres REST endpoint."""
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/",
        headers={**HEADERS, "Prefer": "return=representation"},
        json={"query": sql},
        timeout=30,
    )
    return {"status": resp.status_code, "body": resp.text}

# Try via the Supabase pg_meta endpoint (available on self-hosted / management API)
# For hosted Supabase, we use the REST API with a raw SQL function
# The most reliable approach for hosted Supabase is to use the pg_dump approach
# or create a temporary RPC function

# Actually the cleanest approach: use the Supabase REST API to call a stored procedure
# But we don't have one. Let's try the /sql endpoint which some versions support.

def try_sql_endpoint(sql: str) -> dict:
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/sql",
        headers=HEADERS,
        data=sql,
        timeout=30,
    )
    return {"status": resp.status_code, "body": resp.text}

print("Attempting migration 015 via Supabase REST API...")
print()

# Try the /sql endpoint first
for i, stmt in enumerate(STATEMENTS):
    stmt = stmt.strip()
    if not stmt:
        continue
    print(f"Statement {i+1}: {stmt[:60]}...")
    result = try_sql_endpoint(stmt)
    print(f"  Status: {result['status']}")
    print(f"  Body: {result['body'][:200]}")
    print()
