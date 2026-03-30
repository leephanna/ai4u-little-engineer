/**
 * tolerance-insight-proposer.ts
 * ─────────────────────────────────────────────────────────────
 * Trigger.dev task: analyse print_feedback records to identify
 * systematic dimensional offsets and propose tolerance_insights.
 *
 * Pipeline:
 *   1. Query recent print_feedback with fit issues
 *   2. Cluster by family + printer + material
 *   3. Use Gemini (large-context) to identify patterns
 *   4. Gate each proposal through a Harmonia debate
 *   5. Insert approved proposals into tolerance_insights
 * ─────────────────────────────────────────────────────────────
 */

import { task, logger } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { callAI, HARMONIA_MODELS } from "../lib/ai-providers";
import { runHarmoniaDebate } from "../lib/harmonia";

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key);
}

const Payload = z.object({
  lookback_days: z.number().int().min(1).max(365).default(30),
  min_evidence_count: z.number().int().min(2).default(3),
  /** If true, skip Harmonia debate (for testing) */
  skip_debate: z.boolean().default(false),
});

export const toleranceInsightProposer = task({
  id: "tolerance-insight-proposer",
  maxDuration: 300,
  run: async (payload: unknown) => {
    const { lookback_days, min_evidence_count, skip_debate } = Payload.parse(payload);
    const supabase = getSupabaseClient();

    const since = new Date(Date.now() - lookback_days * 86400_000).toISOString();

    // ── 1. Load print feedback with fit issues ────────────────
    const { data: feedbackRows, error: fbErr } = await supabase
      .from("print_feedback")
      .select("id, job_id, fit_rating, print_quality, notes, created_at")
      .gte("created_at", since)
      .lte("fit_rating", 3) // 1-3 = poor fit
      .order("created_at", { ascending: false })
      .limit(200);

    if (fbErr) throw new Error(`Failed to load print_feedback: ${fbErr.message}`);
    if (!feedbackRows || feedbackRows.length < min_evidence_count) {
      logger.log("Not enough feedback to propose insights", {
        count: feedbackRows?.length ?? 0,
        min_required: min_evidence_count,
      });
      return { proposals: [], evidence_count: feedbackRows?.length ?? 0 };
    }

    logger.log(`Loaded ${feedbackRows.length} poor-fit feedback records`);

    // ── 2. Enrich with job/part_spec data ─────────────────────
    const jobIds = [...new Set(feedbackRows.map((r) => r.job_id as string).filter(Boolean))];
    const { data: jobs } = await supabase
      .from("jobs")
      .select("id, selected_family, part_spec_id")
      .in("id", jobIds);

    const jobMap = new Map((jobs ?? []).map((j) => [j.id as string, j]));

    const enriched = feedbackRows.map((fb) => {
      const job = jobMap.get(fb.job_id as string);
      return {
        feedback_id: fb.id,
        job_id: fb.job_id,
        family: job?.selected_family ?? "unknown",
        fit_rating: fb.fit_rating,
        print_quality: fb.print_quality,
        notes: fb.notes,
      };
    });

    // ── 3. Use Gemini to cluster and identify patterns ─────────
    const clusterPrompt = `You are a precision manufacturing expert analysing 3D print feedback data.

The following ${enriched.length} prints had poor fit ratings (1-3 out of 5):
${JSON.stringify(enriched, null, 2)}

Identify systematic dimensional tolerance issues. For each pattern found:
1. Group by part family
2. Identify which dimension is consistently off
3. Suggest the adjustment needed (in mm)

Respond with JSON:
{
  "insights": [
    {
      "family": "spacer",
      "dimension_name": "outer_diameter",
      "suggested_adjustment_mm": -0.2,
      "confidence": 0.85,
      "evidence_count": 5,
      "evidence_feedback_ids": ["id1", "id2"],
      "condition_context": {"material": "PLA", "pattern": "consistently too tight"},
      "rationale": "Outer diameter is consistently 0.2mm too large causing press-fit issues"
    }
  ]
}`;

    const clusterResp = await callAI(
      HARMONIA_MODELS.cluster,
      [{ role: "user", content: clusterPrompt }],
      { temperature: 0.1, max_tokens: 2048, json_mode: true }
    );

    const insights = (clusterResp.parsed?.insights ?? []) as Record<string, unknown>[];
    logger.log(`Gemini identified ${insights.length} potential tolerance insights`);

    if (insights.length === 0) {
      return { proposals: [], evidence_count: feedbackRows.length };
    }

    // ── 4. Gate each insight through Harmonia ─────────────────
    const insertedInsights: string[] = [];

    for (const insight of insights) {
      const evidenceCount = (insight.evidence_count as number) ?? 0;
      if (evidenceCount < min_evidence_count) {
        logger.log("Skipping insight — insufficient evidence", {
          family: insight.family,
          evidence_count: evidenceCount,
        });
        continue;
      }

      let debateId: string | null = null;
      let finalStatus = "proposed";

      if (!skip_debate) {
        const debateResult = await runHarmoniaDebate({
          topic_type: "tolerance_rule",
          source_record_ids: (insight.evidence_feedback_ids as string[]) ?? [],
          topic_summary: `Propose tolerance adjustment for ${insight.family as string}.${insight.dimension_name as string}: ${insight.suggested_adjustment_mm as number}mm`,
          proposer_context: {
            insight,
            evidence_count: evidenceCount,
            lookback_days,
          },
        });

        // Persist debate
        const { data: debateRow } = await supabase
          .from("intelligence_debates")
          .insert({
            ...debateResult,
            linked_record_type: "tolerance_insight",
          })
          .select("id")
          .single();

        debateId = debateRow?.id as string ?? null;

        if (debateResult.final_recommendation === "approve_eval" && debateResult.risk_score < 0.5) {
          finalStatus = "evaluating";
        } else if (debateResult.final_recommendation === "reject") {
          logger.log("Insight rejected by Harmonia", { family: insight.family });
          continue;
        }
      }

      // ── 5. Insert tolerance insight ───────────────────────────
      const { data: inserted } = await supabase
        .from("tolerance_insights")
        .insert({
          family: insight.family as string,
          dimension_name: insight.dimension_name as string,
          condition_context: (insight.condition_context ?? {}) as Record<string, unknown>,
          suggested_adjustment: insight.suggested_adjustment_mm as number,
          adjustment_unit: "mm",
          confidence_score: Math.min(1, Math.max(0, (insight.confidence as number) ?? 0.5)),
          evidence_count: evidenceCount,
          evidence_record_ids: (insight.evidence_feedback_ids ?? []) as string[],
          status: finalStatus,
          debate_id: debateId,
        })
        .select("id")
        .single();

      if (inserted) {
        insertedInsights.push(`${insight.family}.${insight.dimension_name}`);
        logger.log("Inserted tolerance insight", {
          family: insight.family,
          dimension: insight.dimension_name,
          adjustment: insight.suggested_adjustment_mm,
          status: finalStatus,
        });
      }
    } // end for (const insight of insights)

    // ── Decision ledger ──────────────────────────────────────────────────
    try {
      await supabase.from("decision_ledger").insert({
        job_id: null,
        step: "tolerance_propose",
        decision_reason: `Proposed ${insertedInsights.length} tolerance insights from ${feedbackRows.length} poor-fit feedback records`,
        inputs: { lookback_days, min_evidence_count, feedback_count: feedbackRows.length },
        outputs: { insights: insertedInsights, insight_count: insertedInsights.length },
      });
    } catch { /* non-blocking */ }

    return {
      evidence_count: feedbackRows.length,
      proposal_count: insertedInsights.length,
      proposals: insertedInsights,
    };
  },
});
