/**
 * score-run-quality — Trigger.dev Task
 *
 * Scores a completed CAD run on 4 dimensions and writes the result
 * back to design_learning_records.quality_score.
 *
 * Triggered by: cad-generation-pipeline (on success) or manually.
 *
 * Payload: { job_id: string, cad_run_id: string }
 *
 * Scoring dimensions (each 0-1, averaged):
 *   1. geometry_valid: validation_report_json.valid === true
 *   2. all_artifacts_present: both step + stl artifacts exist
 *   3. dimension_accuracy: normalized_params match spec dimensions
 *   4. generation_speed: duration_ms < 10000 → 1.0, < 30000 → 0.7, else 0.4
 */

import { task, logger } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const ScorePayload = z.object({
  job_id: z.string().uuid(),
  cad_run_id: z.string().uuid(),
});

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key);
}

export const scoreRunQuality = task({
  id: "score-run-quality",
  maxDuration: 60,
  run: async (payload: unknown) => {
    const { job_id, cad_run_id } = ScorePayload.parse(payload);
    const supabase = getSupabaseClient();

    logger.log("Scoring run quality", { job_id, cad_run_id });

    // ── Load cad_run ──────────────────────────────────────────
    const { data: cadRun, error: runErr } = await supabase
      .from("cad_runs")
      .select("*")
      .eq("id", cad_run_id)
      .single();

    if (runErr || !cadRun) {
      throw new Error(`cad_run not found: ${cad_run_id}`);
    }

    // ── Load artifacts ────────────────────────────────────────
    const { data: artifacts } = await supabase
      .from("artifacts")
      .select("kind, file_size_bytes, storage_path")
      .eq("cad_run_id", cad_run_id);

    // ── Load part_spec for dimension comparison ───────────────
    const { data: job } = await supabase
      .from("jobs")
      .select("id")
      .eq("id", job_id)
      .single();

    const { data: partSpec } = await supabase
      .from("part_specs")
      .select("dimensions_json, family")
      .eq("job_id", job_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    // ── Score dimension 1: geometry_valid ─────────────────────
    const validationReport = cadRun.validation_report_json as Record<string, unknown> ?? {};
    const geometryValid = validationReport.valid === true ? 1.0 : 0.0;

    // ── Score dimension 2: all_artifacts_present ──────────────
    const artifactKinds = new Set((artifacts ?? []).map((a) => a.kind));
    const hasStep = artifactKinds.has("step");
    const hasStl = artifactKinds.has("stl");
    const allArtifactsPresent = hasStep && hasStl ? 1.0 : (hasStep || hasStl ? 0.5 : 0.0);

    // ── Score dimension 3: dimension_accuracy ─────────────────
    let dimensionAccuracy = 0.5; // default if we can't compare
    if (partSpec?.dimensions_json && cadRun.normalized_params_json) {
      const specDims = partSpec.dimensions_json as Record<string, number>;
      const normalizedParams = cadRun.normalized_params_json as Record<string, unknown>;
      const specKeys = Object.keys(specDims);
      if (specKeys.length > 0) {
        let matchCount = 0;
        for (const key of specKeys) {
          const specVal = specDims[key];
          // Check both plain key and _mm suffix in normalized params
          const normVal = (normalizedParams[key] ?? normalizedParams[`${key}_mm`]) as number | undefined;
          if (normVal !== undefined && Math.abs(normVal - specVal) / Math.max(specVal, 1) < 0.01) {
            matchCount++;
          }
        }
        dimensionAccuracy = matchCount / specKeys.length;
      }
    }

    // ── Score dimension 4: generation_speed ──────────────────
    const durationMs = (cadRun.duration_ms as number) ?? 30000;
    let speedScore: number;
    if (durationMs < 10000) speedScore = 1.0;
    else if (durationMs < 30000) speedScore = 0.7;
    else speedScore = 0.4;

    // ── Overall quality score ─────────────────────────────────
    const qualityScore = (geometryValid + allArtifactsPresent + dimensionAccuracy + speedScore) / 4;

    const scoreBreakdown = {
      geometry_valid: geometryValid,
      all_artifacts_present: allArtifactsPresent,
      dimension_accuracy: dimensionAccuracy,
      generation_speed: speedScore,
      overall: qualityScore,
    };

    logger.log("Quality score computed", scoreBreakdown);

    // ── Update design_learning_records ────────────────────────
    const { error: updateErr } = await supabase
      .from("design_learning_records")
      .update({
        quality_score: qualityScore,
        generation_status: cadRun.status === "success" ? "success" : "failed",
      })
      .eq("job_id", job_id);

    if (updateErr) {
      logger.warn("Failed to update design_learning_records", { error: updateErr.message });
    }

    // ── Write decision ledger entry ───────────────────────────
    try {
      await supabase.from("decision_ledger").insert({
        job_id,
        step: "score_run_quality",
        decision_reason: `Run quality scored: ${qualityScore.toFixed(3)} (geometry=${geometryValid}, artifacts=${allArtifactsPresent}, dims=${dimensionAccuracy.toFixed(2)}, speed=${speedScore})`,
        inputs: { cad_run_id, family: partSpec?.family ?? "unknown" },
        outputs: scoreBreakdown,
      });
    } catch {
      // Non-blocking
    }

    return {
      job_id,
      cad_run_id,
      quality_score: qualityScore,
      score_breakdown: scoreBreakdown,
    };
  },
});
