/**
 * GET /api/jobs/[jobId]/status
 *
 * Lightweight polling endpoint for job status.
 * Used by the InventionForm and other polling clients.
 *
 * Returns: { status, latest_run_id, updated_at }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const supabase = await createClient();
    const serviceSupabase = createServiceClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: job, error } = await serviceSupabase
      .from("jobs")
      .select("id, status, latest_run_id, updated_at")
      .eq("id", jobId)
      .eq("user_id", user.id)
      .single();

    if (error || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    return NextResponse.json({
      status: job.status,
      latest_run_id: job.latest_run_id,
      updated_at: job.updated_at,
    });
  } catch (err) {
    console.error("Job status error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
