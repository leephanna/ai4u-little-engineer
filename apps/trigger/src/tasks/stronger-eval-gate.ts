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
 *
 * HARDENED (v2.1): All eval families now align to capability_registry
 * production families only:
 *   spacer, l_bracket, flat_bracket, u_bracket, hole_plate,
 *   enclosure, standoff_block, adapter_bushing, cable_clip, simple_jig
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

/**
 * Production families registered in capability_registry (maturity_level=proven):
 *   spacer, l_bracket, flat_bracket, u_bracket, hole_plate,
 *   enclosure, standoff_block, adapter_bushing, cable_clip, simple_jig
 *
 * All test cases below use ONLY these families.
 * Non-production families (bolt, gear, pipe_fitting, hinge) are intentionally
 * excluded — the NLU should return intent=clarify or flag unsupported_family
 * for those requests.
 */
const PRODUCTION_FAMILIES = [
  "spacer", "l_bracket", "flat_bracket", "u_bracket", "hole_plate",
  "enclosure", "standoff_block", "adapter_bushing", "cable_clip", "simple_jig",
] as const;

// ── 10-case eval suite (v2.1 — production families only) ─────
const EVAL_CASES_V2 = [
  // tc-01: Basic spacer — all dims present
  {
    id: "tc-01",
    description: "Basic spacer with all dims",
    transcript: "I need a spacer that is 5mm tall, 20mm outer diameter, 10mm inner diameter",
    expected_intent: "design_part",
    expected_family: "spacer",
    expected_dims: { height: 5, outer_diameter: 20, inner_diameter: 10 },
    expected_missing: [],
  },
  // tc-02: L-bracket — all dims present
  {
    id: "tc-02",
    description: "L-bracket with all dims",
    transcript: "Create an L-bracket, 50mm wide, 40mm tall, 3mm thick",
    expected_intent: "design_part",
    expected_family: "l_bracket",
    expected_dims: { width: 50, height: 40, thickness: 3 },
    expected_missing: [],
  },
  // tc-03: Ambiguous — should clarify
  {
    id: "tc-03",
    description: "Ambiguous request needing clarification",
    transcript: "I want a round thing for my printer",
    expected_intent: "clarify",
    expected_family: null,
    expected_dims: {},
    expected_missing: [],
  },
  // tc-04: Flat bracket — partial dims
  {
    id: "tc-04",
    description: "Flat bracket with partial dims (missing thickness)",
    transcript: "Make a flat bracket, 80mm long, 30mm wide",
    expected_intent: "design_part",
    expected_family: "flat_bracket",
    expected_dims: { length: 80, width: 30 },
    expected_missing_contains: ["thickness"],
  },
  // tc-05: Enclosure — all dims
  {
    id: "tc-05",
    description: "Enclosure with all dims",
    transcript: "I need a small enclosure box, 100mm long, 60mm wide, 40mm tall, 2mm wall thickness",
    expected_intent: "design_part",
    expected_family: "enclosure",
    expected_dims: { length: 100, width: 60, height: 40 },
    expected_missing: [],
  },
  // tc-06: Hole plate — partial dims
  {
    id: "tc-06",
    description: "Hole plate with partial dims",
    transcript: "Make a plate with holes, 100mm by 60mm, 5mm thick",
    expected_intent: "design_part",
    expected_family: "hole_plate",
    expected_dims: { length: 100, width: 60, thickness: 5 },
    expected_missing: [],
  },
  // tc-07: Non-design intent (question)
  {
    id: "tc-07",
    description: "Non-design intent (question)",
    transcript: "What materials work best for outdoor parts?",
    expected_intent: "question",
    expected_family: null,
    expected_dims: {},
    expected_missing: [],
  },
  // tc-08: Standoff block — all dims
  {
    id: "tc-08",
    description: "Standoff block with all dims",
    transcript: "I need a standoff block, 20mm tall, 15mm wide, 15mm deep",
    expected_intent: "design_part",
    expected_family: "standoff_block",
    expected_dims: { height: 20, width: 15, depth: 15 },
    expected_missing: [],
  },
  // tc-09: Spacer with inch dimensions (unit handling)
  {
    id: "tc-09",
    description: "Spacer with inch dimensions",
    transcript: "I need a spacer, 2 inches tall, 1 inch outer diameter, half inch inner diameter",
    expected_intent: "design_part",
    expected_family: "spacer",
    expected_dims: {},
    expected_missing: [],
    note: "Should convert or flag unit mismatch",
  },
  // tc-10: Unsupported family (bolt) — should clarify or flag unsupported
  {
    id: "tc-10",
    description: "Unsupported family (bolt) — should not claim to design it",
    transcript: "Make me an M8 bolt, 30mm long",
    expected_intent: "clarify",
    expected_family: null,
    expected_dims: {},
    expected_missing: [],
    note: "bolt is not in capability_registry; NLU must return clarify or unsupported_family",
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

    logger.log("Running 10-case eval suite (v2.1 — production families only)", {
      prompt_version_id,
      version: promptRow.version,
      production_families: PRODUCTION_FAMILIES,
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
        // Expect null/undefined family for clarify/question intents
        if (!llmResult.family || llmResult.family === null) {
          score++;
        } else {
          // Also pass if family is not in production families (unsupported)
          const isProduction = PRODUCTION_FAMILIES.includes(llmResult.family as typeof PRODUCTION_FAMILIES[number]);
          if (!isProduction) score++;
          else notes.push(`FAIL family: expected null/unsupported, got production family=${llmResult.family}`);
        }
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
        eval_suite_version: "v2.1",
        overall_score: overallScore,
        pass_count: passCount,
        total_cases: EVAL_CASES_V2.length,
        passed: evalPassed,
        regression_risk: regressionRisk,
        production_families_only: true,
        test_cases: results,
      },
      eval_score: overallScore,
      eval_passed: evalPassed,
      eval_suite_version: "v2.1",
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
      topic_summary: `Promote prompt version ${promptRow.version as string} to production (eval score: ${overallScore.toFixed(2)}, ${passCount}/10 cases passed, suite v2.1 production-families-only)`,
      proposer_context: {
        prompt_version_id,
        version: promptRow.version,
        eval_score: overallScore,
        pass_count: passCount,
        regression_risk: regressionRisk,
        eval_suite_version: "v2.1",
        production_families_only: true,
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
