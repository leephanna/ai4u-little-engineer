/**
 * POST /api/jobs/[id]/generate
 * Triggers a CAD generation job via Trigger.dev.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface GenerateBody {
  part_spec_id: string;
  variant_type?: "requested" | "stronger" | "print_optimized" | "alternate";
  engine?: "build123d" | "freecad";
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

    // Verify job ownership and status
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, status, user_id, latest_spec_version")
      .eq("id", jobId)
      .eq("user_id", user.id)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const allowedStatuses = ["draft", "clarifying", "failed"];
    if (!allowedStatuses.includes(job.status)) {
      return NextResponse.json(
        { error: `Cannot generate from status: ${job.status}` },
        { status: 400 }
      );
    }

    const body: GenerateBody = await request.json();
    const {
      part_spec_id,
      variant_type = "requested",
      engine = "build123d",
    } = body;

    if (!part_spec_id) {
      return NextResponse.json(
        { error: "Missing required field: part_spec_id" },
        { status: 400 }
      );
    }

    // Verify spec belongs to this job
    const { data: spec, error: specError } = await supabase
      .from("part_specs")
      .select("id, family")
      .eq("id", part_spec_id)
      .eq("job_id", jobId)
      .single();

    if (specError || !spec) {
      return NextResponse.json(
        { error: "Part spec not found for this job" },
        { status: 404 }
      );
    }

    // Create a CAD run record (queued)
    const { data: cadRun, error: runError } = await supabase
      .from("cad_runs")
      .insert({
        job_id: jobId,
        part_spec_id,
        engine,
        generator_name: spec.family,
        generator_version: "1.0.0",
        status: "queued",
        normalized_params_json: {},
        validation_report_json: {},
      })
      .select()
      .single();

    if (runError || !cadRun) {
      console.error("CAD run insert error:", runError);
      return NextResponse.json(
        { error: "Failed to create CAD run record" },
        { status: 500 }
      );
    }

    // Update job status to generating
    await supabase
      .from("jobs")
      .update({ status: "generating", latest_run_id: cadRun.id })
      .eq("id", jobId);

    // Trigger the Trigger.dev workflow
    // In production, this would use the Trigger.dev SDK:
    //   import { tasks } from "@trigger.dev/sdk/v3";
    //   await tasks.trigger("cad-generation-pipeline", { ... });
    //
    // For now, we call the Trigger.dev API directly via HTTP
    const triggerApiKey = process.env.TRIGGER_SECRET_KEY;
    let triggerJobId: string | null = null;

    if (triggerApiKey) {
      try {
        const triggerRes = await fetch(
          `${process.env.TRIGGER_API_URL ?? "https://api.trigger.dev"}/api/v1/tasks/cad-generation-pipeline/trigger`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${triggerApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              payload: {
                job_id: jobId,
                cad_run_id: cadRun.id,
                part_spec_id,
                variant_type,
                engine,
              },
            }),
          }
        );

        if (triggerRes.ok) {
          const triggerData = await triggerRes.json();
          triggerJobId = triggerData.id;
        } else {
          console.error("Trigger.dev API error:", await triggerRes.text());
        }
      } catch (err) {
        console.error("Failed to trigger Trigger.dev job:", err);
      }
    } else {
      console.warn("TRIGGER_SECRET_KEY not set — skipping Trigger.dev dispatch");
    }

    return NextResponse.json({
      success: true,
      cad_run_id: cadRun.id,
      trigger_job_id: triggerJobId,
      status: "queued",
    });
  } catch (err) {
    console.error("Generate trigger error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
