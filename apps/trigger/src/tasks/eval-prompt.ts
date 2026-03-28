/**
 * eval-prompt — Trigger.dev Task
 *
 * Runs a battery of 5 canonical test cases against a prompt_versions row
 * and records pass/fail + scores back into prompt_versions.eval_results_json.
 *
 * Triggered by:
 *   - propose_prompt_improvement (after generating a candidate prompt)
 *   - Manual trigger for regression testing
 *
 * Payload: { prompt_version_id: string }
 *
 * Eval criteria per test case:
 *   1. Correct family extracted
 *   2. All required dimensions extracted (no missing_fields)
 *   3. Confidence >= 0.7
 *   4. No hallucinated families
 *   5. Correct intent classification
 */

import { task, logger } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { z } from "zod";

const EvalPayload = z.object({
  prompt_version_id: z.string().uuid(),
});

// ── Canonical eval test cases ────────────────────────────────────────────────

const EVAL_CASES = [
  {
    id: "tc_001",
    description: "Clear spacer request with all dimensions",
    transcript: "I need a spacer that is 20mm outer diameter, 10mm inner diameter, and 5mm tall",
    expected_family: "spacer",
    expected_intent: "create_part",
    expected_dimensions: { outer_diameter: 20, inner_diameter: 10, height: 5 },
    expected_missing_fields: [],
    min_confidence: 0.8,
  },
  {
    id: "tc_002",
    description: "Partial mount bracket — missing dimensions",
    transcript: "I need a mounting bracket for a 40mm fan",
    expected_family: "mount_bracket",
    expected_intent: "create_part",
    expected_dimensions: {},
    expected_missing_fields_contains: ["width", "height"],
    min_confidence: 0.6,
  },
  {
    id: "tc_003",
    description: "User confirms spec",
    transcript: "Yes, that looks good, generate it",
    expected_family: null,
    expected_intent: "confirm",
    expected_dimensions: {},
    expected_missing_fields: [],
    min_confidence: 0.7,
  },
  {
    id: "tc_004",
    description: "Cable clip with all dimensions",
    transcript: "Make me a cable clip for a 5mm cable, 3mm wall thickness, 15mm long",
    expected_family: "cable_clip",
    expected_intent: "create_part",
    expected_dimensions: { cable_diameter: 5, wall_thickness: 3, length: 15 },
    expected_missing_fields: [],
    min_confidence: 0.75,
  },
  {
    id: "tc_005",
    description: "Unsupported family — should not hallucinate",
    transcript: "I need a turbine blade for a jet engine",
    expected_family: null,
    expected_intent: "unknown",
    expected_dimensions: {},
    expected_missing_fields: [],
    min_confidence: 0.0,
    must_not_hallucinate: true,
  },
];

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key);
}

function scoreTestCase(
  tc: typeof EVAL_CASES[0],
  result: Record<string, unknown>
): { passed: boolean; score: number; notes: string[] } {
  const notes: string[] = [];
  let score = 0;
  const maxScore = 5;

  // 1. Correct family
  if (tc.expected_family === null) {
    if (result.family === null || result.family === undefined) {
      score += 1;
    } else if (tc.must_not_hallucinate) {
      notes.push(`FAIL: hallucinated family "${result.family}" for unsupported request`);
    } else {
      score += 1; // family being null is acceptable when expected is null
    }
  } else {
    if (result.family === tc.expected_family) {
      score += 1;
    } else {
      notes.push(`FAIL: expected family "${tc.expected_family}", got "${result.family}"`);
    }
  }

  // 2. Correct intent
  if (result.intent === tc.expected_intent) {
    score += 1;
  } else {
    notes.push(`FAIL: expected intent "${tc.expected_intent}", got "${result.intent}"`);
  }

  // 3. Confidence >= min
  const confidence = (result.confidence as number) ?? 0;
  if (confidence >= tc.min_confidence) {
    score += 1;
  } else {
    notes.push(`FAIL: confidence ${confidence} < min ${tc.min_confidence}`);
  }

  // 4. Correct dimensions extracted (check keys present)
  const expectedDimKeys = Object.keys(tc.expected_dimensions ?? {});
  const actualDims = (result.dimensions as Record<string, number>) ?? {};
  if (expectedDimKeys.length === 0) {
    score += 1; // no dimensions expected
  } else {
    const allPresent = expectedDimKeys.every((k) => actualDims[k] !== undefined);
    if (allPresent) {
      score += 1;
    } else {
      const missing = expectedDimKeys.filter((k) => actualDims[k] === undefined);
      notes.push(`FAIL: missing expected dimensions: ${missing.join(", ")}`);
    }
  }

  // 5. Missing fields check
  const actualMissing = (result.missing_fields as string[]) ?? [];
  if (tc.expected_missing_fields && tc.expected_missing_fields.length === 0) {
    if (actualMissing.length === 0) {
      score += 1;
    } else {
      notes.push(`FAIL: unexpected missing_fields: ${actualMissing.join(", ")}`);
    }
  } else if (tc.expected_missing_fields_contains) {
    const allContained = tc.expected_missing_fields_contains.every((f) =>
      actualMissing.includes(f)
    );
    if (allContained) {
      score += 1;
    } else {
      notes.push(`FAIL: missing_fields should contain ${tc.expected_missing_fields_contains.join(", ")}, got ${actualMissing.join(", ")}`);
    }
  } else {
    score += 1;
  }

  return {
    passed: score === maxScore,
    score: score / maxScore,
    notes,
  };
}

export const evalPrompt = task({
  id: "eval-prompt",
  maxDuration: 120,
  run: async (payload: unknown, ctx) => {
    const { prompt_version_id } = EvalPayload.parse(payload);
    const supabase = getSupabaseClient();
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    logger.log("Starting prompt eval", { prompt_version_id });

    // ── Load prompt version ───────────────────────────────────
    const { data: promptRow, error: promptErr } = await supabase
      .from("prompt_versions")
      .select("*")
      .eq("id", prompt_version_id)
      .single();

    if (promptErr || !promptRow) {
      throw new Error(`Prompt version not found: ${prompt_version_id}`);
    }

    logger.log("Loaded prompt version", {
      name: promptRow.name,
      version: promptRow.version,
      status: promptRow.status,
    });

    // ── Run all 5 test cases ──────────────────────────────────
    const results: Record<string, unknown>[] = [];
    let totalScore = 0;

    for (const tc of EVAL_CASES) {
      logger.log(`Running test case ${tc.id}`, { description: tc.description });

      let llmResult: Record<string, unknown> = {};
      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-4.1-mini",
          messages: [
            { role: "system", content: promptRow.prompt_text },
            { role: "user", content: tc.transcript },
          ],
          temperature: 0.1,
          max_tokens: 512,
          response_format: { type: "json_object" },
        });
        const raw = completion.choices[0]?.message?.content ?? "{}";
        llmResult = JSON.parse(raw);
      } catch (err) {
        logger.warn(`LLM call failed for ${tc.id}`, { error: String(err) });
        llmResult = { intent: "unknown", family: null, dimensions: {}, missing_fields: [], confidence: 0 };
      }

      const { passed, score, notes } = scoreTestCase(tc, llmResult);
      totalScore += score;

      results.push({
        test_case_id: tc.id,
        description: tc.description,
        transcript: tc.transcript,
        passed,
        score,
        notes,
        llm_output: llmResult,
      });

      logger.log(`Test case ${tc.id} result`, { passed, score, notes });
    }

    const overallScore = totalScore / EVAL_CASES.length;
    const passCount = results.filter((r) => r.passed).length;
    const passed = passCount >= 4; // 4/5 required to pass

    logger.log("Eval complete", {
      overall_score: overallScore,
      pass_count: passCount,
      passed,
    });

    // ── Write eval results back to prompt_versions ────────────
    await supabase
      .from("prompt_versions")
      .update({
        eval_results_json: {
          eval_run_id: ctx.run.id,
          evaluated_at: new Date().toISOString(),
          overall_score: overallScore,
          pass_count: passCount,
          total_cases: EVAL_CASES.length,
          passed,
          test_cases: results,
        },
        eval_score: overallScore,
        eval_passed: passed,
      })
      .eq("id", prompt_version_id);

    // ── Write decision ledger entry ───────────────────────────
    try {
      await supabase.from("decision_ledger").insert({
        job_id: null,
        step: "eval_prompt",
        decision_reason: `Evaluated prompt ${promptRow.version} (${promptRow.name}): score=${overallScore.toFixed(2)}, passed=${passed}`,
        inputs: { prompt_version_id, prompt_version: promptRow.version },
        outputs: { overall_score: overallScore, pass_count: passCount, passed },
      });
    } catch {
      // Non-blocking
    }

    return {
      prompt_version_id,
      prompt_version: promptRow.version,
      overall_score: overallScore,
      pass_count: passCount,
      total_cases: EVAL_CASES.length,
      passed,
    };
  },
});
