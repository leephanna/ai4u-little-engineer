/**
 * One-time script to create the router_log table in Supabase.
 * Uses the service role key (not the management API token).
 *
 * Run with: node scripts/create_router_log.mjs
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://lphtdosxneplxgkygjom.supabase.co";
const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwaHRkb3N4bmVwbHhna3lnam9tIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc5MDczNSwiZXhwIjoyMDg5MzY2NzM1fQ.WWLgOOm0QsOnHrbz8TyVZNKWnEpKlNM0365hB4q_gH4";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const SQL = `
CREATE TABLE IF NOT EXISTS router_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_input       TEXT NOT NULL,
  routed_family   TEXT,
  confidence      INTEGER CHECK (confidence >= 0 AND confidence <= 100),
  ai_explanation  TEXT,
  user_accepted   BOOLEAN NOT NULL DEFAULT false,
  final_family    TEXT
);

CREATE INDEX IF NOT EXISTS idx_router_log_routed_family ON router_log (routed_family);
CREATE INDEX IF NOT EXISTS idx_router_log_created_at    ON router_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_router_log_user_accepted ON router_log (user_accepted);

ALTER TABLE router_log ENABLE ROW LEVEL SECURITY;
`;

// Use the pg_catalog approach via a custom RPC function
// Since we can't run raw DDL via PostgREST, we'll create a temporary function

const CREATE_EXEC_FN = `
CREATE OR REPLACE FUNCTION public.exec_ddl(sql text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE sql;
END;
$$;
`;

const DROP_EXEC_FN = `DROP FUNCTION IF EXISTS public.exec_ddl(text)`;

async function run() {
  console.log("Creating exec_ddl helper function...");
  
  // We can't run DDL directly via PostgREST, so we need another approach.
  // Let's try inserting a test row to check if the table already exists.
  const { error: checkError } = await supabase
    .from("router_log")
    .select("id")
    .limit(1);

  if (!checkError) {
    console.log("✓ router_log table already exists!");
    process.exit(0);
  }

  console.log("Table does not exist. Error:", checkError.message);
  console.log("\nCannot create DDL via PostgREST without an exec function.");
  console.log("The migration file is committed to the repo at:");
  console.log("  packages/db/migrations/018_router_log.sql");
  console.log("\nTo apply manually, run this SQL in the Supabase SQL editor:");
  console.log(SQL);
  
  process.exit(1);
}

run().catch(console.error);
