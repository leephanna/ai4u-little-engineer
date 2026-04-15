/**
 * GET /api/admin/daedalus/receipts
 *
 * Operator endpoint for inspecting Daedalus Gate receipts.
 * Supports filtering by:
 *   - session_id
 *   - job_id
 *   - gate (e.g. "intake_interpretation", "harmonia_merge")
 *   - result (GO | CLARIFY | REJECT | WARN)
 *   - limit (default 50)
 *
 * Requires operator role.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getAuthUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    // Auth check
    const supabase = await createClient();
        const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Operator check
    const serviceSupabase = createServiceClient();
    const { data: profile } = await serviceSupabase
      .from("profiles")
      .select("role")
      .eq("clerk_user_id", user.id)
      .single();

    if (profile?.role !== "operator") {
      return NextResponse.json({ error: "Operator access required" }, { status: 403 });
    }

    // Parse query params
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("session_id");
    const jobId = searchParams.get("job_id");
    const gate = searchParams.get("gate");
    const result = searchParams.get("result");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 200);

    // Build query
    let query = serviceSupabase
      .from("daedalus_receipts")
      .select("*")
      .order("timestamp", { ascending: false })
      .limit(limit);

    if (sessionId) query = query.eq("session_id", sessionId);
    if (jobId) query = query.eq("job_id", jobId);
    if (gate) query = query.eq("gate", gate);
    if (result) query = query.eq("result", result);

    const { data: receipts, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      receipts: receipts ?? [],
      count: receipts?.length ?? 0,
      filters: { session_id: sessionId, job_id: jobId, gate, result, limit },
    });
  } catch (err) {
    console.error("Daedalus receipts API error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
