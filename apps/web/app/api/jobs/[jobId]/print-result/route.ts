/**
 * POST /api/jobs/[id]/print-result
 * Record a print outcome for a job.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify job ownership
    const { data: job } = await supabase
      .from("jobs")
      .select("id, status, latest_run_id, user_id")
      .eq("id", jobId)
      .eq("user_id", user.id)
      .single();

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const body = await request.json();
    const {
      outcome,
      fit_score,
      strength_score,
      surface_score,
      issue_tags,
      notes,
      printer_name,
      material,
      layer_height,
      nozzle_size,
      infill_percent,
      orientation_notes,
    } = body;

    if (!outcome || !["success", "partial", "fail"].includes(outcome)) {
      return NextResponse.json(
        { error: "Invalid outcome. Must be: success, partial, or fail" },
        { status: 400 }
      );
    }

    // Insert print result
    const { data: printResult, error: insertError } = await supabase
      .from("print_results")
      .insert({
        job_id: jobId,
        cad_run_id: job.latest_run_id,
        printer_name: printer_name ?? null,
        material: material ?? null,
        layer_height: layer_height ?? null,
        nozzle_size: nozzle_size ?? null,
        infill_percent: infill_percent ?? null,
        orientation_notes: orientation_notes ?? null,
        outcome,
        fit_score: fit_score ?? null,
        strength_score: strength_score ?? null,
        surface_score: surface_score ?? null,
        issue_tags: issue_tags ?? [],
        notes: notes ?? null,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Print result insert error:", insertError);
      return NextResponse.json(
        { error: "Failed to save print result" },
        { status: 500 }
      );
    }

    // Update job status to "printed" if outcome is success
    if (outcome === "success") {
      await supabase
        .from("jobs")
        .update({ status: "printed", updated_at: new Date().toISOString() })
        .eq("id", jobId);
    }

    return NextResponse.json({
      success: true,
      print_result_id: printResult.id,
    });
  } catch (err) {
    console.error("Print result error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
