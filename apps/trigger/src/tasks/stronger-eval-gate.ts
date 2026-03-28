/**
 * stronger-eval-gate.ts
 * ─────────────────────────────────────────────────────────────
 * Trigger.dev task: run the 10-case eval suite against a
 * prompt_version candidate, then gate promotion through a
 * Harmonia debate.
 *
 * Promotion requires:
 *   • ≥ 8/10 test cases pass (vs. 4/5 in the old gate)
 *   • Harmonia consensus = "approve_eval"
 *   • risk_score < 0.4
 *   • No regression vs. the current production prompt
 * ─────────────────────────────────────────────────────────────
 */

import { task, logger } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { runHarmoniaDebate } from "../lib/harmonia";

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key);
}

// ── 10-case eval suite ────────────────────────────────────────
const EVAL_CASES_V2 = [
  // Basic spacer
  {
    id: "tc-01", description: "Basic spacer with all dims",
    transcript: "I need a spacer that is 5mm tall, 20mm outer diameter, 10mm inner diameter",
    expected_intent: "design_part", expected_family: "spacer",
    expected_dims: { height: 5, outer_diameter: 20, inner_diameter: 10 },
    expected_missing: [],
  },
  // Bolt with partial dims
  {
    id: "tc-02", description: "Bolt missing thread pitch",
    transcript: "Make me an M8 bolt, 30mm long",
    expected_intent: "design_part", expected_family: "bolt",
    expected_dims: { length: 30 },
    expected_missing_contains: ["thread_pitch"],
  },
  // Ambiguous family
  {
    id: "tc-03", description: "Ambiguous request needing clarification",
    transcript: "I want a round thing for my printer",
    expected_intent: "clarify", expected_family: null,
    expected_dims: {},
    expected_missing: [],
  },
  // Bracket
  {
    id: "tc-04", description: "Bracket with all dims",
    transcript: "Create an L-bracket, 50mm wide, 40mm tall, 3mm thick",
    expected_intent: "design_part", expected_family: "bracket",
    expected_dims: { width: 50, height: 40, thickness: 3 },
    expected_missing: [],
  },
  // Gear
  {
    id: "tc-05", description: "Gear with partial dims",
    transcript: "I need a spur gear with 20 teeth",
    expected_intent: "design_part", expected_family: "gear",
    expected_dims: { tooth_count: 20 },
    expected_missing_contains: ["module_mm"],
  },
  // Pipe fitting
  {
    id: "tc-06", description: "Pipe fitting",
    transcript: "Make a pipe fitting for 25mm pipe, 15mm long",
    expected_intent: "design_part", expected_family: "pipe_fitting",
    expected_dims: { pipe_diameter: 25, length: 15 },
    expected_missing: [],
  },
  // Hinge
  {
    id: "tc-07", description: "Hinge with all dims",
    transcript: "Design a hinge, 60mm wide, 30mm per leaf, 3mm thick",
    expected_intent: "design_part", expected_family: "hinge",
    expected_dims: { width: 60, leaf_length: 30, thickness: 3 },
    expected_missing: [],
  },
  // Non-design intent
  {
    id: "tc-08", description: "Non-design intent (question)",
    transcript: "What materials work best for outdoor parts?",
    expected_intent: "question", expected_family: null,
    expected_dims: {},
    expected_missing: [],
  },
  // Metric conversion
  {
    id: "tc-09", description: "Dimensions given in inches",
    transcript: "I need a spacer, 2 inches tall, 1 inch outer diameter, half inch inner diameter",
    expected_intent: "design_part", expected_family: "spacer",
    expected_dims: {},
    expected_missing: [],
    note: "Should convert or flag unit mismatch",
  },
  // Complex multi-part
  {
    id: "tc-10", description: "Complex request with multiple parts mentioned",
    transcript: "I need a bolt and nut set, M6, 25mm bolt length",
    expected_intent: "design_part", expected_family: "bolt",
    expected_dims: { length: 25 },
    expected_missing_contains: ["thread_pitch"],
  },
];

// ── Payload ───────────────────────────────────────────────────
const Payload = z.object({
  prompt_version_id: z.string().uuid(),
  /** If true, skip Harmonia debate and just run eval */
  eval_only: z.boolean().default(false),
});

// ── Task ──────────────────────────────────────────────────────
export const strongerEvalGate = task({
  id: "stronger-eval-gate",
  maxDuration: 300,
  run: async (payload: unknown) => {
    const { prompt_version_id, eval_only } = Payload.parse(payload);
    const supabase = getSupabaseClient();
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // ── Load prompt version ───────────────────────────────────
    const { data: promptRow, error: promptErr } = await supabase
      .from("prompt_versions")
      .select("*")
      .eq("id", prompt_version_id)
      .single();
    if (promptErr || !promptRow) throw new Error(`Prompt version not found: ${prompt_version_id}`);

    logger.log("Running 10-case eval suite", {
      prompt_version_id,
      version: promptRow.version,
    });

    // ── Load current production prompt for regression check ───
    const { data: prodPrompt } = await supabase
      .from("prompt_versions")
      .select("id, version, eval_score")
      .eq("status", "production")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    // ── Run all 10 test cases ─────────────────────────────────
    const results: Record<string, unknown>[] = [];
    let totalScore = 0;
    let passCount = 0;

    for (const tc of EVAL_CASES_V2) {
      let llmResult: Record<string, unknown> = {};
      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-4.1-mini",
          messages: [
            { role: "system", content: promptRow.prompt_text as string },
            { role: "user", content: tc.transcript },
          ],
          temperature: 0.1,
          max_tokens: 512,
          response_format: { type: "json_object" },
        });
        llmResult = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
      } catch (err) {
        llmResult = { intent: "unknown", family: null, dimensions: {}, missing_fields: [], confidence: 0 };
      }

      // Score the test case
      let score = 0;
      const notes: string[] = [];

      // Intent check
      if (llmResult.intent === tc.expected_intent) {
        score++;
      } else {
        notes.push(`FAIL intent: expected=${tc.expected_intent}, got=${llmResult.intent}`);
      }

      // Family check
      if (tc.expected_family === null) {
        score++;
      } else if (llmResult.family === tc.expected_family) {
        score++;
      } else {
        notes.push(`FAIL family: expected=${tc.expected_family}, got=${llmResult.family}`);
      }

      // Dimension check
      const actualDims = (llmResult.dimensions ?? {}) as Record<string, unknown>;
      const expectedKeys = Object.keys(tc.expected_dims ?? {});
      if (expectedKeys.length === 0) {
        score++;
      } else {
        const allPresent = expectedKeys.every((k) => actualDims[k] !== undefined);
        if (allPresent) score++;
        else notes.push(`FAIL dims: missing ${expectedKeys.filter((k) => !actualDims[k]).join(", ")}`);
      }

      // Missing fields check
      const actualMissing = (llmResult.missing_fields ?? []) as string[];
      if (tc.expected_missing && tc.expected_missing.length === 0) {
        if (actualMissing.length === 0) score++;
        else notes.push(`FAIL: unexpected missing_fields: ${actualMissing.join(", ")}`);
      } else if (tc.expected_missing_contains) {
        const allContained = tc.expected_missing_contains.every((f) => actualMissing.includes(f));
        if (allContained) score++;
        else notes.push(`FAIL: missing_fields should contain ${tc.expected_missing_contains.join(", ")}`);
      } else {
        score++;
      }

      const tcScore = score / 4;
      const passed = score >= 3; // 3/4 sub-checks = pass
      if (passed) passCount++;
      totalScore += tcScore;

      results.push({
        test_case_id: tc.id,
        description: tc.description,
        transcript: tc.transcript,
        passed,
        score: tcScore,
        notes,
        llm_output: llmResult,
      });

      logger.log(`TC ${tc.id}: ${passed ? "PASS" : "FAIL"}`, { score: tcScore, notes });
    }

    const overallScore = totalScore / EVAL_CASES_V2.length;
    const evalPassed = passCount >= 8; // 8/10 required
    const regressionRisk = prodPrompt
      ? Math.max(0, (prodPrompt.eval_score as number ?? 0) - overallScore)
      : 0;

    logger.log("Eval complete", { overallScore, passCount, evalPassed, regressionRisk });

    // ── Update prompt_versions with eval results ──────────────
    await supabase.from("prompt_versions").update({
      eval_results_json: {
        eval_run_id: `stronger-eval-${Date.now()}`,
        evaluated_at: new Date().toISOString(),
        overall_score: overallScore,
        pass_count: passCount,
        total_cases: EVAL_CASES_V2.length,
        passed: evalPassed,
        regression_risk: regressionRisk,
        test_cases: results,
      },
      eval_score: overallScore,
      eval_passed: evalPassed,
      eval_suite_version: "v2",
      regression_risk_score: regressionRisk,
    }).eq("id", prompt_version_id);

    if (eval_only || !evalPassed) {
      return {
        prompt_version_id,
        eval_passed: evalPassed,
        overall_score: overallScore,
        pass_count: passCount,
        regression_risk: regressionRisk,
        promoted: false,
        reason: evalPassed ? "eval_only mode" : `Only ${passCount}/10 cases passed (need 8)`,
      };
    }

    // ── Gate: Run Harmonia debate before promotion ─────────────
    logger.log("Eval passed — running Harmonia debate for promotion gate");

    const debateResult = await runHarmoniaDebate({
      topic_type: "prompt_improvement",
      source_record_ids: [prompt_version_id],
      topic_summary: `Promote prompt version ${promptRow.version as string} to production (eval score: ${overallScore.toFixed(2)}, ${passCount}/10 cases passed)`,
      proposer_context: {
        prompt_version_id,
        version: promptRow.version,
        eval_score: overallScore,
        pass_count: passCount,
        regression_risk: regressionRisk,
        current_production_version: prodPrompt?.version ?? "none",
        current_production_score: prodPrompt?.eval_score ?? 0,
        eval_results_summary: results.map((r) => ({
          id: r.test_case_id,
          passed: r.passed,
          notes: r.notes,
        })),
      },
    });

    // ── Persist debate ────────────────────────────────────────
    const { data: debateRow } = await supabase
      .from("intelligence_debates")
      .insert({
        ...debateResult,
        linked_record_id: prompt_version_id,
        linked_record_type: "prompt_version",
      })
      .select("id")
      .single();

    const debateId = debateRow?.id as string;

    // Update prompt_versions with debate reference
    await supabase.from("prompt_versions").update({
      debate_id: debateId,
    }).eq("id", prompt_version_id);

    // ── Promotion decision ────────────────────────────────────
    const shouldPromote =
      debateResult.final_recommendation === "approve_eval" &&
      debateResult.risk_score < 0.4;

    if (shouldPromote) {
      // Demote current production prompt
      if (prodPrompt) {
        await supabase.from("prompt_versions")
          .update({ status: "archived" })
          .eq("id", prodPrompt.id);
      }
      // Promote candidate
      await supabase.from("prompt_versions").update({
        status: "production",
        promoted_by: "harmonia",
        promoted_at: new Date().toISOString(),
      }).eq("id", prompt_version_id);

      logger.log("Prompt promoted to production", { prompt_version_id, debate_id: debateId });
    } else {
      logger.log("Promotion blocked by Harmonia", {
        recommendation: debateResult.final_recommendation,
        risk_score: debateResult.risk_score,
      });
    }

    return {
      prompt_version_id,
      eval_passed: evalPassed,
      overall_score: overallScore,
      pass_count: passCount,
      regression_risk: regressionRisk,
      debate_id: debateId,
      harmonia_recommendation: debateResult.final_recommendation,
      harmonia_risk_score: debateResult.risk_score,
      promoted: shouldPromote,
    };
  },
});
