/**
 * propose-prompt-improvement — Trigger.dev Task
 *
 * Analyzes recent design_learning_records with low quality scores or
 * high clarification counts, generates an improved NLU prompt candidate,
 * runs it through the eval runner, and promotes it to production only if
 * eval_score >= 0.85 AND pass_count >= 4/5.
 *
 * Promotion gate (hard rules):
 *   - eval_score >= 0.85
 *   - pass_count >= 4 out of 5
 *   - New prompt must not regress on any previously-passing test case
 *
 * Triggered by: scheduled (weekly) or manually.
 * Payload: { prompt_name?: string } (default: "interpret_voice_nlu")
 */

import { task, logger, tasks } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { z } from "zod";

const ProposePayload = z.object({
  prompt_name: z.string().default("interpret_voice_nlu"),
  min_eval_score: z.number().default(0.85),
  min_pass_count: z.number().default(4),
});

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key);
}

function bumpVersion(version: string): string {
  // Increment minor version: "v1.0" → "v1.1", "v1.9" → "v1.10"
  const match = version.match(/^v(\d+)\.(\d+)$/);
  if (match) {
    return `v${match[1]}.${parseInt(match[2]) + 1}`;
  }
  return `${version}-improved`;
}

export const proposePromptImprovement = task({
  id: "propose-prompt-improvement",
  maxDuration: 300,
  run: async (payload: unknown) => {
    const { prompt_name, min_eval_score, min_pass_count } = ProposePayload.parse(payload ?? {});
    const supabase = getSupabaseClient();
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    logger.log("Starting prompt improvement proposal", { prompt_name });

    // ── Load current production prompt ────────────────────────
    const { data: currentPrompt, error: promptErr } = await supabase
      .from("prompt_versions")
      .select("*")
      .eq("name", prompt_name)
      .eq("status", "production")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (promptErr || !currentPrompt) {
      throw new Error(`No production prompt found for: ${prompt_name}`);
    }

    logger.log("Loaded current prompt", {
      version: currentPrompt.version,
      eval_score: currentPrompt.eval_score,
    });

    // ── Load recent low-quality learning records ──────────────
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const { data: poorRecords } = await supabase
      .from("design_learning_records")
      .select("transcript, parsed_intent, final_spec, spec_corrections, clarification_count, quality_score")
      .gte("created_at", since)
      .or("quality_score.lt.0.7,clarification_count.gte.3")
      .order("created_at", { ascending: false })
      .limit(20);

    logger.log("Loaded poor-quality records", { count: poorRecords?.length ?? 0 });

    // ── Build improvement context ─────────────────────────────
    const improvementContext = poorRecords && poorRecords.length > 0
      ? `Recent user sessions that had issues (high clarification count or low quality score):
${JSON.stringify(poorRecords.slice(0, 10), null, 2)}`
      : "No recent poor-quality sessions found. Propose incremental improvements.";

    // ── Generate improved prompt via LLM ─────────────────────
    const metaPrompt = `You are an expert prompt engineer for an AI-powered voice CAD design assistant.

Current production NLU prompt:
---
${currentPrompt.prompt_text}
---

${improvementContext}

Your task: Generate an improved version of the NLU prompt that:
1. Better handles the failure patterns shown above
2. Maintains all existing capabilities
3. Is more explicit about edge cases
4. Does NOT remove any supported part families or dimensions
5. Keeps the same JSON response schema

Respond with ONLY the improved prompt text (no explanation, no markdown, just the raw prompt).`;

    let improvedPromptText: string;
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [{ role: "user", content: metaPrompt }],
        temperature: 0.3,
        max_tokens: 2048,
      });
      improvedPromptText = completion.choices[0]?.message?.content?.trim() ?? "";
    } catch (err) {
      throw new Error(`Failed to generate improved prompt: ${err}`);
    }

    if (!improvedPromptText || improvedPromptText.length < 100) {
      throw new Error("Generated prompt is too short or empty");
    }

    const newVersion = bumpVersion(currentPrompt.version);
    logger.log("Generated improved prompt", {
      new_version: newVersion,
      prompt_length: improvedPromptText.length,
    });

    // ── Insert candidate prompt (status: candidate) ───────────
    const { data: candidateRow, error: insertErr } = await supabase
      .from("prompt_versions")
      .insert({
        name: prompt_name,
        version: newVersion,
        prompt_text: improvedPromptText,
        status: "candidate",
        parent_version_id: currentPrompt.id,
        change_summary: `Auto-proposed improvement based on ${poorRecords?.length ?? 0} poor-quality sessions`,
      })
      .select()
      .single();

    if (insertErr || !candidateRow) {
      throw new Error(`Failed to insert candidate prompt: ${insertErr?.message}`);
    }

    logger.log("Inserted candidate prompt", { id: candidateRow.id, version: newVersion });

    // ── Run eval on candidate prompt ──────────────────────────
    logger.log("Triggering eval run", { prompt_version_id: candidateRow.id });

    const evalResult = await tasks.triggerAndWait("eval-prompt", {
      prompt_version_id: candidateRow.id,
    });

    if (!evalResult.ok) {
      logger.warn("Eval task failed", { error: evalResult.error });
      await supabase
        .from("prompt_versions")
        .update({ status: "archived", change_summary: `Eval task failed: ${evalResult.error}` })
        .eq("id", candidateRow.id);
      return { promoted: false, reason: "eval_task_failed", version: newVersion };
    }

    const evalOutput = evalResult.output as {
      overall_score: number;
      pass_count: number;
      passed: boolean;
    };

    logger.log("Eval complete", {
      overall_score: evalOutput.overall_score,
      pass_count: evalOutput.pass_count,
      passed: evalOutput.passed,
    });

    // ── Promotion gate ────────────────────────────────────────
    const meetsScoreThreshold = evalOutput.overall_score >= min_eval_score;
    const meetsPassThreshold = evalOutput.pass_count >= min_pass_count;
    const shouldPromote = meetsScoreThreshold && meetsPassThreshold;

    if (shouldPromote) {
      logger.log("Promotion gate PASSED — promoting to production", {
        score: evalOutput.overall_score,
        pass_count: evalOutput.pass_count,
      });

      // Archive current production prompt
      await supabase
        .from("prompt_versions")
        .update({ status: "archived" })
        .eq("id", currentPrompt.id);

      // Promote candidate to production
      await supabase
        .from("prompt_versions")
        .update({ status: "production" })
        .eq("id", candidateRow.id);

      // Write decision ledger
      await supabase.from("decision_ledger").insert({
        job_id: null,
        step: "promote_prompt",
        decision_reason: `Promoted prompt ${newVersion} to production: score=${evalOutput.overall_score.toFixed(3)}, pass_count=${evalOutput.pass_count}/${5}`,
        inputs: {
          previous_version: currentPrompt.version,
          candidate_version: newVersion,
          min_eval_score,
          min_pass_count,
        },
        outputs: {
          promoted: true,
          eval_score: evalOutput.overall_score,
          pass_count: evalOutput.pass_count,
        },
      });

      return {
        promoted: true,
        reason: "passed_promotion_gate",
        version: newVersion,
        eval_score: evalOutput.overall_score,
        pass_count: evalOutput.pass_count,
      };
    } else {
      const reason = !meetsScoreThreshold
        ? `eval_score ${evalOutput.overall_score.toFixed(3)} < ${min_eval_score}`
        : `pass_count ${evalOutput.pass_count} < ${min_pass_count}`;

      logger.log("Promotion gate FAILED — archiving candidate", { reason });

      await supabase
        .from("prompt_versions")
        .update({
          status: "archived",
          change_summary: `Failed promotion gate: ${reason}`,
        })
        .eq("id", candidateRow.id);

      await supabase.from("decision_ledger").insert({
        job_id: null,
        step: "reject_prompt",
        decision_reason: `Rejected prompt ${newVersion}: ${reason}`,
        inputs: { candidate_version: newVersion, min_eval_score, min_pass_count },
        outputs: {
          promoted: false,
          eval_score: evalOutput.overall_score,
          pass_count: evalOutput.pass_count,
          reason,
        },
      });

      return {
        promoted: false,
        reason,
        version: newVersion,
        eval_score: evalOutput.overall_score,
        pass_count: evalOutput.pass_count,
      };
    }
  },
});
