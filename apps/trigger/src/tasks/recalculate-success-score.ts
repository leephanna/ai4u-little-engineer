/**
 * recalculate-success-score — Trigger.dev Task
 *
 * Recalculates the print success score for a project based on:
 *   - Successful prints (fit_result = 'perfect' or 'good')
 *   - Failed prints (fit_result = 'poor' or 'failed')
 *   - User ratings (overall_rating 1–5)
 *   - Reuse frequency (usage_count)
 *
 * Score formula (0–100):
 *   base_score = (successful_prints / total_prints) * 60
 *   rating_score = (avg_rating / 5) * 25
 *   reuse_score = min(usage_count / 10, 1) * 15
 *   success_score = base_score + rating_score + reuse_score
 *
 * Also determines best_material and best_printer from feedback data.
 *
 * Triggered by:
 *   - New print_feedback submitted
 *   - Project usage_count increment
 *   - Manual admin recalculation
 */

import { task, logger } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const Payload = z.object({
  project_id: z.string().uuid(),
});
type Payload = z.infer<typeof Payload>;

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set");
  return createClient(url, key, { auth: { persistSession: false } });
}

export const recalculateSuccessScore = task({
  id: "recalculate-success-score",
  maxDuration: 60,

  run: async (payload: Payload) => {
    const parsed = Payload.safeParse(payload);
    if (!parsed.success) {
      throw new Error(`Invalid payload: ${JSON.stringify(parsed.error.issues)}`);
    }
    const { project_id } = parsed.data;
    const supabase = getSupabase();

    logger.info("Recalculating success score", { project_id });

    // ── 1. Fetch project ────────────────────────────────────────
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, usage_count, job_id")
      .eq("id", project_id)
      .single();

    if (projectError || !project) {
      logger.error("Project not found", { project_id, error: projectError?.message });
      return { ok: false, reason: "project_not_found" };
    }

    // ── 2. Fetch all print feedback for this project's job ──────
    // print_feedback is linked to jobs, and projects are linked to jobs
    const { data: feedback } = await supabase
      .from("print_feedback")
      .select("overall_rating, fit_result, material, printed")
      .eq("job_id", project.job_id ?? "00000000-0000-0000-0000-000000000000");

    const allFeedback = feedback ?? [];

    // ── 3. Calculate metrics ────────────────────────────────────
    const printedFeedback = allFeedback.filter((f) => f.printed !== false);
    const totalPrints = printedFeedback.length;

    const successfulPrints = printedFeedback.filter(
      (f) => f.fit_result === "perfect" || f.fit_result === "good"
    ).length;

    const failedPrints = printedFeedback.filter(
      (f) => f.fit_result === "poor" || f.fit_result === "failed"
    ).length;

    const ratingsWithValue = allFeedback.filter(
      (f) => f.overall_rating !== null && f.overall_rating > 0
    );
    const avgRating =
      ratingsWithValue.length > 0
        ? ratingsWithValue.reduce((sum, f) => sum + (f.overall_rating ?? 0), 0) /
          ratingsWithValue.length
        : null;

    const usageCount = project.usage_count ?? 0;

    // ── 4. Compute success score ────────────────────────────────
    let successScore: number | null = null;
    let successRate: number | null = null;

    if (totalPrints > 0 || ratingsWithValue.length > 0 || usageCount > 0) {
      const baseScore = totalPrints > 0 ? (successfulPrints / totalPrints) * 60 : 30; // 30 = neutral if no prints yet
      const ratingScore = avgRating !== null ? (avgRating / 5) * 25 : 12.5; // 12.5 = neutral
      const reuseScore = Math.min(usageCount / 10, 1) * 15;

      successScore = Math.round((baseScore + ratingScore + reuseScore) * 100) / 100;
      successRate = totalPrints > 0
        ? Math.round((successfulPrints / totalPrints) * 10000) / 100
        : null;
    }

    // ── 5. Determine best material and printer ──────────────────
    // Count successful prints by material
    const materialCounts: Record<string, number> = {};
    for (const f of printedFeedback.filter(
      (f) => f.fit_result === "perfect" || f.fit_result === "good"
    )) {
      if (f.material) {
        materialCounts[f.material] = (materialCounts[f.material] ?? 0) + 1;
      }
    }

    const bestMaterial =
      Object.keys(materialCounts).length > 0
        ? Object.entries(materialCounts).sort((a, b) => b[1] - a[1])[0][0]
        : null;

    // ── 6. Update project ───────────────────────────────────────
    const { error: updateError } = await supabase
      .from("projects")
      .update({
        success_score: successScore,
        success_rate: successRate,
        successful_prints: successfulPrints,
        failed_prints: failedPrints,
        best_material: bestMaterial,
        score_updated_at: new Date().toISOString(),
        ...(avgRating !== null ? { rating: Math.round(avgRating * 100) / 100 } : {}),
      })
      .eq("id", project_id);

    if (updateError) {
      logger.error("Failed to update project score", { error: updateError.message });
      throw new Error(`Score update failed: ${updateError.message}`);
    }

    logger.info("Success score updated", {
      project_id,
      success_score: successScore,
      success_rate: successRate,
      successful_prints: successfulPrints,
      failed_prints: failedPrints,
      avg_rating: avgRating,
      best_material: bestMaterial,
    });

    return {
      ok: true,
      project_id,
      success_score: successScore,
      success_rate: successRate,
      successful_prints: successfulPrints,
      failed_prints: failedPrints,
      avg_rating: avgRating,
      best_material: bestMaterial,
    };
  },
});
