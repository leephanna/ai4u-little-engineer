/**
 * POST /api/jobs/[id]/approve
 * Submit an approval decision for a job's CAD run.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface ApproveBody {
  cad_run_id: string;
  decision: "approved" | "rejected" | "revision_requested";
  notes?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify job ownership
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, status, user_id")
      .eq("id", jobId)
      .eq("user_id", user.id)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (job.status !== "awaiting_approval") {
      return NextResponse.json(
        { error: `Job is not awaiting approval (current status: ${job.status})` },
        { status: 400 }
      );
    }

    const body: ApproveBody = await request.json();
    const { cad_run_id, decision, notes } = body;

    if (!cad_run_id || !decision) {
      return NextResponse.json(
        { error: "Missing required fields: cad_run_id, decision" },
        { status: 400 }
      );
    }

    // Insert approval record
    const { data: approval, error: approvalError } = await supabase
      .from("approvals")
      .insert({
        job_id: jobId,
        cad_run_id,
        reviewer_user_id: user.id,
        decision,
        notes: notes ?? null,
        decided_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (approvalError) {
      console.error("Approval insert error:", approvalError);
      return NextResponse.json(
        { error: "Failed to save approval" },
        { status: 500 }
      );
    }

    // Update job status
    const newStatus =
      decision === "approved"
        ? "approved"
        : decision === "rejected"
        ? "rejected"
        : "draft"; // revision_requested → back to draft

    await supabase
      .from("jobs")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", jobId);

    return NextResponse.json({
      success: true,
      approval_id: approval.id,
      new_status: newStatus,
    });
  } catch (err) {
    console.error("Approval error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
