/**
 * harmonia-debate.ts
 * ─────────────────────────────────────────────────────────────
 * Trigger.dev task: orchestrate a full 3-round multi-AI debate
 * and persist the result to the `intelligence_debates` table.
 *
 * This is the entry-point for all Harmonia governance decisions.
 * Other tasks (stronger-eval-gate, tolerance-insight-proposer,
 * propose-new-capability) call this task to get a structured
 * consensus before acting.
 * ─────────────────────────────────────────────────────────────
 */

import { task, logger } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { runHarmoniaDebate, type TopicType } from "../lib/harmonia";

// ── Supabase client ───────────────────────────────────────────
function getSupabaseClient() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key);
}

// ── Payload schema ────────────────────────────────────────────
const DebatePayload = z.object({
  topic_type: z.enum([
    "prompt_improvement",
    "capability_proposal",
    "tolerance_rule",
    "validation_update",
  ]),
  topic_summary: z.string().min(10),
  source_record_ids: z.array(z.string()).default([]),
  proposer_context: z.record(z.unknown()),
  /** Optional: link the debate result to an existing record */
  linked_record_id: z.string().uuid().optional(),
  linked_record_type: z.string().optional(),
});

// ── Task ──────────────────────────────────────────────────────
export const harmoniaDebate = task({
  id: "harmonia-debate",
  maxDuration: 180,
  run: async (payload: unknown) => {
    const ctx = DebatePayload.parse(payload);
    const supabase = getSupabaseClient();

    logger.log("Starting Harmonia debate", {
      topic_type: ctx.topic_type,
      topic_summary: ctx.topic_summary,
    });

    // ── Run the 3-round debate ────────────────────────────────
    const result = await runHarmoniaDebate({
      topic_type: ctx.topic_type as TopicType,
      source_record_ids: ctx.source_record_ids,
      topic_summary: ctx.topic_summary,
      proposer_context: ctx.proposer_context,
    });

    logger.log("Debate complete", {
      final_recommendation: result.final_recommendation,
      risk_score: result.risk_score,
      novelty_score: result.novelty_score,
      total_tokens: result.total_tokens,
      estimated_cost_usd: result.estimated_cost_usd,
    });

    // ── Persist to intelligence_debates ───────────────────────
    const { data: debateRow, error: insertErr } = await supabase
      .from("intelligence_debates")
      .insert({
        topic_type: result.topic_type,
        source_record_ids: result.source_record_ids,
        proposer_model: result.proposer_model,
        proposer_provider: result.proposer_provider,
        proposer_output: result.proposer_output,
        proposer_tokens: result.proposer_tokens,
        proposer_latency_ms: result.proposer_latency_ms,
        critic_model: result.critic_model,
        critic_provider: result.critic_provider,
        critic_output: result.critic_output,
        critic_tokens: result.critic_tokens,
        critic_latency_ms: result.critic_latency_ms,
        judge_model: result.judge_model,
        judge_provider: result.judge_provider,
        consensus_output: result.consensus_output,
        judge_tokens: result.judge_tokens,
        judge_latency_ms: result.judge_latency_ms,
        final_recommendation: result.final_recommendation,
        risk_score: result.risk_score,
        novelty_score: result.novelty_score,
        linked_record_id: ctx.linked_record_id ?? null,
        linked_record_type: ctx.linked_record_type ?? null,
        total_tokens: result.total_tokens,
        estimated_cost_usd: result.estimated_cost_usd,
      })
      .select("id")
      .single();

    if (insertErr || !debateRow) {
      logger.error("Failed to persist debate", { error: insertErr?.message });
      throw new Error(`Failed to persist debate: ${insertErr?.message}`);
    }

    const debateId = debateRow.id as string;
    logger.log("Debate persisted", { debate_id: debateId });

    // ── Write decision ledger entry ───────────────────────────
    await supabase.from("decision_ledger").insert({
      job_id: null,
      step: "debate_judge",
      decision_reason: `Harmonia debate (${ctx.topic_type}): ${result.final_recommendation} — risk=${result.risk_score.toFixed(2)}, novelty=${result.novelty_score.toFixed(2)}`,
      inputs: {
        topic_type: ctx.topic_type,
        topic_summary: ctx.topic_summary,
        source_record_ids: ctx.source_record_ids,
      },
      outputs: {
        debate_id: debateId,
        final_recommendation: result.final_recommendation,
        risk_score: result.risk_score,
        novelty_score: result.novelty_score,
        total_tokens: result.total_tokens,
      },
    }).catch(() => { /* non-blocking */ });

    return {
      debate_id: debateId,
      final_recommendation: result.final_recommendation,
      risk_score: result.risk_score,
      novelty_score: result.novelty_score,
      total_tokens: result.total_tokens,
      estimated_cost_usd: result.estimated_cost_usd,
      consensus_output: result.consensus_output,
    };
  },
});
