/**
 * POST /api/admin/migrate-router-log
 *
 * One-time migration endpoint to create the router_log table.
 * Protected by the admin bypass key.
 *
 * This endpoint exists because the Supabase management API token
 * was unavailable during the initial deployment. It should be called
 * once after deployment to create the table, then can be ignored.
 *
 * The router_log table stores AI Router decisions for analytics.
 * The /api/invent route inserts into it fire-and-forget (non-blocking).
 * If the table doesn't exist, inserts silently fail — no user impact.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(request: NextRequest) {
  // Admin bypass key required
  const probeKey = request.headers.get("x-admin-bypass-key");
  const adminBypassKey = process.env.ADMIN_BYPASS_KEY?.trim();
  if (!adminBypassKey || probeKey?.trim() !== adminBypassKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceSupabase = createServiceClient();

  // Check if table already exists
  const { error: checkError } = await serviceSupabase
    .from("router_log")
    .select("id")
    .limit(1);

  if (!checkError) {
    return NextResponse.json({
      status: "already_exists",
      message: "router_log table already exists",
    });
  }

  // Table doesn't exist — return the SQL to run manually
  // (We can't run DDL via PostgREST without a stored procedure)
  const sql = `
-- Run this in the Supabase SQL editor:
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

CREATE POLICY service_role_all ON router_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);
  `.trim();

  return NextResponse.json({
    status: "needs_migration",
    message: "router_log table does not exist. Run the SQL below in the Supabase SQL editor.",
    sql,
    supabase_sql_editor: "https://supabase.com/dashboard/project/lphtdosxneplxgkygjom/sql/new",
    error: checkError.message,
  });
}
