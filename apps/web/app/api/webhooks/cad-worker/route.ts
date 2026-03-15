/**
 * POST /api/webhooks/cad-worker
 * Receives generation results from the CAD worker (via Trigger.dev task callback).
 * Updates cad_runs, artifacts, and job status in Supabase.
 *
 * This endpoint is called by the Trigger.dev cad-generation-pipeline task.
 * Secured by WEBHOOK_SECRET header verification.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

interface CadWorkerResult {
  job_id: string;
  cad_run_id: string;
  part_spec_id: string;
  status: "success" | "failed";
  generator_name: string;
  generator_version: string;
  normalized_params: Record<string, unknown>;
  validation: {
    bounding_box_ok: boolean;
    wall_thickness_ok: boolean;
    units_ok: boolean;
    printability_score: number;
    bounding_box_mm?: number[];
    min_wall_thickness_mm?: number;
    warnings: string[];
    errors: string[];
  } | null;
  artifacts: Array<{
    kind: string;
    storage_path: string;
    mime_type: string;
    file_size_bytes: number | null;
  }>;
  error?: string;
  failure_stage?: string;
  assumptions: string[];
  warnings: string[];
  duration_ms: number;
}

export async function POST(request: NextRequest) {
  try {
    // Verify webhook secret
    const webhookSecret = process.env.WEBHOOK_SECRET;
    if (webhookSecret) {
      const authHeader = request.headers.get("x-webhook-secret");
      if (authHeader !== webhookSecret) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const result: CadWorkerResult = await request.json();
    const supabase = await createServiceClient();

    const {
      job_id,
      cad_run_id,
      status,
      generator_name,
      generator_version,
      normalized_params,
      validation,
      artifacts,
      error: errorText,
      failure_stage,
      duration_ms,
    } = result;

    // Update CAD run record
    const { error: runUpdateError } = await supabase
      .from("cad_runs")
      .update({
        status,
        generator_name,
        generator_version,
        normalized_params_json: normalized_params,
        validation_report_json: validation ?? {},
        error_text: errorText ?? null,
        ended_at: new Date().toISOString(),
      })
      .eq("id", cad_run_id);

    if (runUpdateError) {
      console.error("CAD run update error:", runUpdateError);
    }

    // Insert artifacts if generation succeeded
    if (status === "success" && artifacts.length > 0) {
      const artifactInserts = artifacts.map((a) => ({
        cad_run_id,
        job_id,
        kind: a.kind,
        storage_path: a.storage_path,
        mime_type: a.mime_type,
        file_size_bytes: a.file_size_bytes,
      }));

      const { error: artifactError } = await supabase
        .from("artifacts")
        .insert(artifactInserts);

      if (artifactError) {
        console.error("Artifact insert error:", artifactError);
      }
    }

    // Update job status
    const newJobStatus = status === "success" ? "awaiting_approval" : "failed";

    await supabase
      .from("jobs")
      .update({
        status: newJobStatus,
        latest_run_id: cad_run_id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job_id);

    console.log(
      `CAD webhook: job=${job_id} run=${cad_run_id} status=${status} ` +
        `duration=${duration_ms}ms artifacts=${artifacts.length}`
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("CAD worker webhook error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
