/**
 * Run Virtual Print Lab — Trigger.dev Task
 *
 * Triggered after a successful CAD generation run. Calls the CAD worker's
 * /vpl endpoint with the STL public URL, persists the result to the
 * virtual_print_tests table, and updates the cad_runs + projects tables
 * with the print_success_score and grade.
 *
 * This task is fire-and-forget from the pipeline — it does NOT block
 * job approval or delivery. Failures are logged but do not fail the job.
 */
import { task, logger } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

// ─────────────────────────────────────────────────────────────
// Payload schema
// ─────────────────────────────────────────────────────────────
const VPLPayload = z.object({
  job_id: z.string().uuid(),
  cad_run_id: z.string().uuid(),
  stl_storage_path: z.string(),          // e.g. "cad-artifacts/job-uuid/part.stl"
  project_id: z.string().uuid().optional(),
});
type VPLPayload = z.infer<typeof VPLPayload>;

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key);
}

function getStlPublicUrl(storagePath: string): string {
  const supabaseUrl = process.env.SUPABASE_URL ?? "";
  // storage_path is relative to the bucket, e.g. "job-uuid/part.stl"
  // The bucket name is "cad-artifacts"
  const bucket = "cad-artifacts";
  const pathInBucket = storagePath.startsWith(`${bucket}/`)
    ? storagePath.slice(bucket.length + 1)
    : storagePath;
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${pathInBucket}`;
}

// ─────────────────────────────────────────────────────────────
// Task
// ─────────────────────────────────────────────────────────────
export const runVirtualPrintLab = task({
  id: "run-virtual-print-lab",
  maxDuration: 300,  // 5 minutes max (PrusaSlicer can be slow on complex parts)
  run: async (payload: VPLPayload) => {
    const { job_id, cad_run_id, stl_storage_path, project_id } = VPLPayload.parse(payload);
    const supabase = getSupabaseClient();
    const cadWorkerUrl = process.env.CAD_WORKER_URL ?? "";

    logger.info("VPL task starting", { job_id, cad_run_id, stl_storage_path });

    // Build the public URL for the STL
    const stlUrl = getStlPublicUrl(stl_storage_path);
    logger.info("VPL: STL public URL", { stlUrl });

    // ── Step 1: Call the CAD worker VPL endpoint ──────────────
    let vplResult: Record<string, unknown>;
    try {
      const response = await fetch(`${cadWorkerUrl}/vpl`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stl_url: stlUrl }),
        signal: AbortSignal.timeout(240_000),  // 4 minute timeout
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`CAD worker VPL endpoint returned ${response.status}: ${errText.slice(0, 200)}`);
      }

      const body = await response.json() as { success: boolean; result?: Record<string, unknown>; error?: string };
      if (!body.success || !body.result) {
        throw new Error(`VPL engine failed: ${body.error ?? "unknown error"}`);
      }
      vplResult = body.result;
    } catch (err) {
      logger.error("VPL: CAD worker call failed", { error: String(err), job_id });
      // Non-blocking — don't fail the job
      return { success: false, error: String(err), job_id, cad_run_id };
    }

    const score = vplResult.print_success_score as number;
    const grade = vplResult.grade as string;
    const readyToPrint = vplResult.ready_to_print as boolean;
    const riskLevel = vplResult.risk_level as string;

    logger.info("VPL: analysis complete", { score, grade, readyToPrint, riskLevel, job_id });

    // ── Step 2: Persist to virtual_print_tests ────────────────
    const { error: insertError } = await supabase
      .from("virtual_print_tests")
      .insert({
        job_id,
        cad_run_id,
        stl_storage_path,
        print_success_score: score,
        grade,
        ready_to_print: readyToPrint,
        risk_level: riskLevel,
        geometry_result: vplResult.geometry_result,
        slicer_result: vplResult.slicer_result,
        heuristic_result: vplResult.heuristic_result,
        score_breakdown: vplResult.score_breakdown,
        all_issues: vplResult.all_issues,
        all_recommendations: vplResult.all_recommendations,
        elapsed_seconds: vplResult.elapsed_seconds,
        slicer_version: "PrusaSlicer 2.4.0",
      });

    if (insertError) {
      logger.error("VPL: failed to insert virtual_print_tests record", {
        error: insertError.message,
        job_id,
      });
    }

    // ── Step 3: Update cad_runs with VPL score ────────────────
    await supabase
      .from("cad_runs")
      .update({
        vpl_score: score,
        vpl_grade: grade,
        vpl_ready_to_print: readyToPrint,
        vpl_risk_level: riskLevel,
      })
      .eq("id", cad_run_id);

    // ── Step 4: Update projects table if project_id is known ──
    if (project_id) {
      await supabase
        .from("projects")
        .update({
          print_success_score: score,
          updated_at: new Date().toISOString(),
        })
        .eq("id", project_id);
    } else {
      // Try to find project by job_id
      const { data: project } = await supabase
        .from("projects")
        .select("id")
        .eq("source_job_id", job_id)
        .maybeSingle();

      if (project) {
        await supabase
          .from("projects")
          .update({
            print_success_score: score,
            updated_at: new Date().toISOString(),
          })
          .eq("id", project.id);
      }
    }

    logger.info("VPL task completed", { score, grade, job_id, cad_run_id });

    return {
      success: true,
      job_id,
      cad_run_id,
      print_success_score: score,
      grade,
      ready_to_print: readyToPrint,
      risk_level: riskLevel,
    };
  },
});
