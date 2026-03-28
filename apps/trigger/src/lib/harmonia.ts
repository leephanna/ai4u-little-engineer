/**
 * harmonia.ts
 * ─────────────────────────────────────────────────────────────
 * Harmonia Phase 2 — Multi-AI Debate Orchestrator
 *
 * Runs a structured 3-round debate:
 *   Round 1 — Proposer generates a recommendation
 *   Round 2 — Critic challenges the proposal
 *   Round 3 — Judge synthesises a final consensus
 *
 * Returns a DebateResult that can be persisted to
 * the `intelligence_debates` table.
 * ─────────────────────────────────────────────────────────────
 */

import {
  callAI,
  estimateCostUsd,
  HARMONIA_MODELS,
  type AiResponse,
} from "./ai-providers";

// ── Types ─────────────────────────────────────────────────────

export type TopicType =
  | "prompt_improvement"
  | "capability_proposal"
  | "tolerance_rule"
  | "validation_update";

export interface DebateContext {
  topic_type: TopicType;
  source_record_ids: string[];
  /** Human-readable summary of what is being debated */
  topic_summary: string;
  /** Full context data passed to the Proposer */
  proposer_context: Record<string, unknown>;
}

export interface DebateResult {
  topic_type: TopicType;
  source_record_ids: string[];
  proposer_model: string;
  proposer_provider: string;
  proposer_output: Record<string, unknown>;
  proposer_tokens: number;
  proposer_latency_ms: number;
  critic_model: string;
  critic_provider: string;
  critic_output: Record<string, unknown>;
  critic_tokens: number;
  critic_latency_ms: number;
  judge_model: string;
  judge_provider: string;
  consensus_output: Record<string, unknown>;
  judge_tokens: number;
  judge_latency_ms: number;
  final_recommendation: "approve_eval" | "reject" | "human_review";
  risk_score: number;
  novelty_score: number;
  total_tokens: number;
  estimated_cost_usd: number;
}

// ── Prompt templates ──────────────────────────────────────────

function buildProposerPrompt(ctx: DebateContext): string {
  return `You are the Proposer in the Harmonia AI governance system for an AI-powered CAD design assistant.

Your role: Generate a concrete, well-reasoned proposal for the following topic.

TOPIC TYPE: ${ctx.topic_type}
TOPIC SUMMARY: ${ctx.topic_summary}

CONTEXT DATA:
${JSON.stringify(ctx.proposer_context, null, 2)}

Generate a detailed proposal. Respond with JSON:
{
  "proposal_summary": "One sentence summary",
  "proposed_change": { /* specific change details, structure depends on topic_type */ },
  "rationale": "Detailed reasoning",
  "expected_benefit": "Quantified or qualified expected improvement",
  "risk_factors": ["risk1", "risk2"],
  "confidence": 0.0-1.0,
  "novelty": 0.0-1.0
}`;
}

function buildCriticPrompt(
  ctx: DebateContext,
  proposerOutput: Record<string, unknown>
): string {
  return `You are the Critic in the Harmonia AI governance system. Your role is to rigorously challenge the Proposer's recommendation.

TOPIC TYPE: ${ctx.topic_type}
TOPIC SUMMARY: ${ctx.topic_summary}

PROPOSER'S PROPOSAL:
${JSON.stringify(proposerOutput, null, 2)}

Be adversarial but fair. Identify genuine weaknesses, edge cases, and risks. Respond with JSON:
{
  "critique_summary": "One sentence summary of your critique",
  "weaknesses": ["weakness1", "weakness2"],
  "edge_cases": ["edge case 1", "edge case 2"],
  "risk_assessment": "low|medium|high",
  "risk_score": 0.0-1.0,
  "counter_proposal": { /* optional alternative or modification */ },
  "verdict": "approve|reject|needs_modification",
  "verdict_confidence": 0.0-1.0
}`;
}

function buildJudgePrompt(
  ctx: DebateContext,
  proposerOutput: Record<string, unknown>,
  criticOutput: Record<string, unknown>
): string {
  return `You are the Judge in the Harmonia AI governance system. Your role is to synthesise the Proposer and Critic outputs into a final consensus decision.

TOPIC TYPE: ${ctx.topic_type}
TOPIC SUMMARY: ${ctx.topic_summary}

PROPOSER'S PROPOSAL:
${JSON.stringify(proposerOutput, null, 2)}

CRITIC'S CRITIQUE:
${JSON.stringify(criticOutput, null, 2)}

Weigh both perspectives and produce a final recommendation. Respond with JSON:
{
  "consensus_summary": "One sentence summary",
  "final_recommendation": "approve_eval|reject|human_review",
  "recommendation_rationale": "Detailed reasoning",
  "risk_score": 0.0-1.0,
  "novelty_score": 0.0-1.0,
  "conditions": ["condition if any, e.g. 'must pass 7/10 eval cases'"],
  "confidence": 0.0-1.0,
  "merged_proposal": { /* final version of the proposed change, incorporating critic feedback */ }
}`;
}

// ── Main orchestrator ─────────────────────────────────────────

export async function runHarmoniaDebate(ctx: DebateContext): Promise<DebateResult> {
  // Round 1: Proposer
  const proposerResp: AiResponse = await callAI(
    HARMONIA_MODELS.proposer,
    [{ role: "user", content: buildProposerPrompt(ctx) }],
    { temperature: 0.3, max_tokens: 1024, json_mode: true }
  );
  const proposerOutput = proposerResp.parsed ?? { raw: proposerResp.content, error: proposerResp.error };

  // Round 2: Critic
  const criticResp: AiResponse = await callAI(
    HARMONIA_MODELS.critic,
    [{ role: "user", content: buildCriticPrompt(ctx, proposerOutput) }],
    { temperature: 0.2, max_tokens: 1024, json_mode: true }
  );
  const criticOutput = criticResp.parsed ?? { raw: criticResp.content, error: criticResp.error };

  // Round 3: Judge
  const judgeResp: AiResponse = await callAI(
    HARMONIA_MODELS.judge,
    [{ role: "user", content: buildJudgePrompt(ctx, proposerOutput, criticOutput) }],
    { temperature: 0.1, max_tokens: 1024, json_mode: true }
  );
  const consensusOutput = judgeResp.parsed ?? { raw: judgeResp.content, error: judgeResp.error };

  // Extract final recommendation
  const finalRec = (consensusOutput.final_recommendation as string) ?? "human_review";
  const validRecs = ["approve_eval", "reject", "human_review"] as const;
  const finalRecommendation = validRecs.includes(finalRec as typeof validRecs[number])
    ? (finalRec as typeof validRecs[number])
    : "human_review";

  const totalTokens = proposerResp.total_tokens + criticResp.total_tokens + judgeResp.total_tokens;
  const estimatedCost = estimateCostUsd(proposerResp) + estimateCostUsd(criticResp) + estimateCostUsd(judgeResp);

  return {
    topic_type: ctx.topic_type,
    source_record_ids: ctx.source_record_ids,
    proposer_model: HARMONIA_MODELS.proposer.model,
    proposer_provider: HARMONIA_MODELS.proposer.provider,
    proposer_output: proposerOutput,
    proposer_tokens: proposerResp.total_tokens,
    proposer_latency_ms: proposerResp.latency_ms,
    critic_model: HARMONIA_MODELS.critic.model,
    critic_provider: HARMONIA_MODELS.critic.provider,
    critic_output: criticOutput,
    critic_tokens: criticResp.total_tokens,
    critic_latency_ms: criticResp.latency_ms,
    judge_model: HARMONIA_MODELS.judge.model,
    judge_provider: HARMONIA_MODELS.judge.provider,
    consensus_output: consensusOutput,
    judge_tokens: judgeResp.total_tokens,
    judge_latency_ms: judgeResp.latency_ms,
    final_recommendation: finalRecommendation,
    risk_score: (consensusOutput.risk_score as number) ?? 0.5,
    novelty_score: (consensusOutput.novelty_score as number) ?? 0.5,
    total_tokens: totalTokens,
    estimated_cost_usd: estimatedCost,
  };
}
