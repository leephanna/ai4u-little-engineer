/**
 * POST /api/jobs/[jobId]/revise
 *
 * Phase 2D: Revision / iteration flow.
 *
 * Accepts user feedback describing what to change, creates a new PartSpec
 * version with the revision notes applied via the AI clarification pipeline,
 * and resets the job status to "clarifying" so the user can review before
 * re-generating.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface ReviseBody {
  feedback: string;
  base_version: number;
  family: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse body
  let body: ReviseBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { feedback, base_version, family } = body;
  if (!feedback?.trim()) {
    return NextResponse.json({ error: "feedback is required" }, { status: 400 });
  }

  // Verify job belongs to user
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id, status, user_id")
    .eq("id", jobId)
    .eq("user_id", user.id)
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Fetch the base spec version
  const { data: baseSpec, error: specError } = await supabase
    .from("part_specs")
    .select("*")
    .eq("job_id", jobId)
    .eq("version", base_version)
    .single();

  if (specError || !baseSpec) {
    return NextResponse.json(
      { error: `Part spec version ${base_version} not found` },
      { status: 404 }
    );
  }

  // Create a new spec version with the revision feedback appended to assumptions
  const newVersion = base_version + 1;
  const existingAssumptions: string[] = baseSpec.assumptions_json ?? [];
  const revisionNote = `[Revision v${newVersion}] ${feedback.trim()}`;

  const { data: newSpec, error: insertError } = await supabase
    .from("part_specs")
    .insert({
      job_id: jobId,
      version: newVersion,
      family: family ?? baseSpec.family,
      dimensions_json: baseSpec.dimensions_json,
      constraints_json: baseSpec.constraints_json,
      material: baseSpec.material,
      units: baseSpec.units,
      assumptions_json: [...existingAssumptions, revisionNote],
      clarification_questions_json: [],
      confidence_score: null,
      status: "draft",
    })
    .select()
    .single();

  if (insertError || !newSpec) {
    console.error("Failed to create revision spec:", insertError);
    return NextResponse.json(
      { error: "Failed to create revision spec" },
      { status: 500 }
    );
  }

  // Reset job status to "clarifying" and bump latest_spec_version
  const { error: updateError } = await supabase
    .from("jobs")
    .update({
      status: "clarifying",
      latest_spec_version: newVersion,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  if (updateError) {
    console.error("Failed to update job status:", updateError);
    return NextResponse.json(
      { error: "Failed to update job status" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    new_version: newVersion,
    spec_id: newSpec.id,
    message: `Revision v${newVersion} created. Review and generate when ready.`,
  });
}
