/**
 * POST /api/invent
 *
 * Adaptive Invention Engine — converts a plain-English problem description into a
 * printable CAD solution.
 *
 * Flow:
 *   1. Auth check (Clerk or admin bypass key)
 *   2. Parse request body
 *   3. Fast-path A: primitive normalizer (cube, cylinder, spacer, standoff)
 *      → If matched, skip all LLM calls
 *   4. Fast-path B: pre-resolved intake (from UniversalCreatorFlow)
 *      → If family + dims already provided, skip LLM
 *   5. AI Router (NEW): gpt-4.1-mini maps input to best family
 *      → direct_match (≥75% confidence, no missing dims) → create job
 *      → soft_match (≥50% OR missing dims) → return { status: "soft_match" }
 *      → custom_generate (no parametric family fits) → call /generate-custom on CAD worker
 *      → unsupported (null family, not describable) → return { status: "unsupported" }
 *   6. Truth Gate validation
 *   7. Create session → job → part_spec → trigger CAD pipeline
 *   8. Fire-and-forget router_log insert
 *   9. Return result
 *
 * The client polls /api/jobs/[jobId] for CAD generation status.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { shouldBypassLimits } from "@/lib/access-policy";
import OpenAI from "openai";
import {
  REQUIRED_DIMENSIONS,
  PART_FAMILY_DESCRIPTIONS,
  MVP_PART_FAMILIES,
  type MvpPartFamily,
} from "@ai4u/shared";
import { tryNormalizePrimitive } from "@/lib/primitive-normalizer";
import { runTruthGate, formatTruthGateReceipt } from "@/lib/truth-gate";
import { getAuthUser } from "@/lib/auth";
import { runAiRouter } from "@/lib/ai-router";

// ─────────────────────────────────────────────────────────────────────────────
// Legacy LLM Invention Prompt (fallback when AI router is unavailable)
// ─────────────────────────────────────────────────────────────────────────────

const INVENTION_SYSTEM_PROMPT = `You are an expert mechanical engineer and 3D printing specialist.
Your job is to convert a plain-English problem description into a concrete, printable CAD solution.

You have access to exactly 10 part families. You MUST select one of these families:
- spacer: Cylindrical spacer. Required dims: outer_diameter, inner_diameter, length (all in mm)
- flat_bracket: Flat mounting plate with holes. Required dims: length, width, thickness, hole_count, hole_diameter (all in mm)
- l_bracket: L-shaped corner bracket. Required dims: leg_a, leg_b, thickness, width (all in mm)
- u_bracket: U-shaped saddle clamp for pipes/tubes. Required dims: pipe_od, wall_thickness, flange_width, flange_length (all in mm)
- hole_plate: Plate with hole pattern. Required dims: length, width, thickness, hole_count, hole_diameter (all in mm)
- standoff_block: Rectangular standoff block. Required dims: length, width, height, hole_diameter (all in mm)
- cable_clip: Cable routing clip. Required dims: cable_od, wall_thickness, base_width (all in mm)
- enclosure: Box/enclosure for electronics. Required dims: inner_length, inner_width, inner_height, wall_thickness (all in mm)
- adapter_bushing: Bore adapter/sleeve. Required dims: outer_diameter, inner_diameter, length (all in mm)
- simple_jig: Alignment jig/fixture. Required dims: length, width, height (all in mm)

SAFETY RULES:
- All dimensions must be physically realizable (no zero or negative values)
- All dimensions must be within printable range: minimum 1mm, maximum 500mm
- Prefer support-free designs (avoid overhangs >45°)
- Wall thickness must be at least 1.2mm for structural integrity
- If the problem cannot be solved by any of the 10 families, set confidence to 0.0 and explain in reasoning

RESPONSE FORMAT (strict JSON, no markdown):
{
  "family": "one_of_the_10_families",
  "parameters": {
    "required_dim_1": number,
    "required_dim_2": number
  },
  "reasoning": "Why this design solves the problem. What the part does. How to print it.",
  "confidence": 0.0_to_1.0,
  "rejection_reason": null_or_string
}

If confidence < 0.5, set rejection_reason to explain why the problem cannot be solved.
Always include ALL required dimensions for the selected family. Use realistic values based on the problem context.`;

// ─────────────────────────────────────────────────────────────────────────────
// Validation helpers
// ─────────────────────────────────────────────────────────────────────────────

interface InventionResult {
  family: string;
  parameters: Record<string, number>;
  reasoning: string;
  confidence: number;
  rejection_reason: string | null;
}

function validateInventionResult(result: InventionResult): string | null {
  // Check family is valid
  if (!MVP_PART_FAMILIES.includes(result.family as MvpPartFamily)) {
    return `Unknown family: ${result.family}. Must be one of: ${MVP_PART_FAMILIES.join(", ")}`;
  }

  const family = result.family as MvpPartFamily;
  const required = REQUIRED_DIMENSIONS[family];

  // Check all required dimensions are present
  for (const dim of required) {
    if (!(dim in result.parameters)) {
      return `Missing required dimension: ${dim} for family ${family}`;
    }
    const val = result.parameters[dim];
    if (typeof val !== "number" || isNaN(val) || val <= 0) {
      return `Invalid value for ${dim}: ${val}. Must be a positive number.`;
    }
    if (val > 500) {
      return `Dimension ${dim}=${val}mm exceeds maximum printable size of 500mm.`;
    }
  }

  // Safety: minimum wall thickness check for relevant families
  const wallDims = ["wall_thickness", "thickness"];
  for (const wallDim of wallDims) {
    if (wallDim in result.parameters && result.parameters[wallDim] < 1.2) {
      return `Wall thickness ${result.parameters[wallDim]}mm is below minimum structural thickness of 1.2mm.`;
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Example prompts for the graceful unsupported response
// ─────────────────────────────────────────────────────────────────────────────

const EXAMPLE_PROMPTS = [
  { label: "M5 spacer, 20mm OD, 5mm bore, 15mm tall", family: "spacer" },
  { label: "Cable clip for a 6mm cable, 3mm wall, 20mm wide", family: "cable_clip" },
  { label: "Small electronics box, 50×30×20mm inside, 2mm walls", family: "enclosure" },
  { label: "L-bracket mount, 50mm wide, 40mm tall, 3mm thick", family: "l_bracket" },
  { label: "Standoff block, 20mm base, 15mm tall, 3mm hole", family: "standoff_block" },
];

// ─────────────────────────────────────────────────────────────────────────────
// CAD Worker URL helper
// ─────────────────────────────────────────────────────────────────────────────

function getCadWorkerUrl(): string {
  return (
    process.env.CAD_WORKER_URL ??
    process.env.NEXT_PUBLIC_CAD_WORKER_URL ??
    "https://ai4u-cad-worker.onrender.com"
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────────────────────

// ── Commit SHA baked in at build time ────────────────────────────────────────
const COMMIT_SHA = process.env.VERCEL_GIT_COMMIT_SHA ?? "local";

export async function POST(request: NextRequest) {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY ?? "placeholder",
  });

  try {
    const supabase = await createClient();
    const serviceSupabase = createServiceClient();

    // ── Owner probe bypass (ADMIN_BYPASS_KEY header) ──────────────────────────
    const probeKey = request.headers.get("x-admin-bypass-key");
    // Trim env var to handle trailing newlines or whitespace from Vercel env storage
    const adminBypassKey = process.env.ADMIN_BYPASS_KEY?.trim();
    const isOwnerProbe = adminBypassKey && probeKey?.trim() === adminBypassKey;

    // Auth check
    const user = await getAuthUser();
    if (!user && !isOwnerProbe) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const effectiveUser = user ?? { id: "owner-probe", email: "owner@ai4u.app" };

    // Parse request body
    // Accepts two payload shapes:
    //   1. Old shape: { problem: string }  — from InventionForm / direct API calls
    //   2. New shape: { text: string, intake_family_candidate?: string,
    //                   intake_dimensions?: Record<string, number> }
    //                — from UniversalCreatorFlow after interpretation
    //   3. Custom shape: { text: string, custom_generate: true,
    //                      custom_description: string,
    //                      previous_code?: string,
    //                      refinement_instruction?: string }
    //                — from UniversalCreatorFlow custom_preview refinement
    const body = await request.json();
    const {
      problem,
      text,
      intake_family_candidate,
      intake_dimensions,
      custom_generate: isCustomGenerate,
      custom_description,
      previous_code,
      refinement_instruction,
    } = body as {
      problem?: string;
      text?: string;
      intake_family_candidate?: string;
      intake_dimensions?: Record<string, number>;
      custom_generate?: boolean;
      custom_description?: string;
      previous_code?: string;
      refinement_instruction?: string;
    };

    // Normalise: accept either `problem` or `text` as the description
    const rawDescription = problem ?? text;
    if (!rawDescription || typeof rawDescription !== "string" || rawDescription.trim().length < 5) {
      return NextResponse.json(
        { error: "Missing or too-short problem description (min 5 characters)" },
        { status: 400 }
      );
    }

    const problemText = rawDescription.trim().slice(0, 1000); // cap at 1000 chars

    // ── Custom generate fast-path: skip all routing, go directly to CAD worker ─
    // This handles both initial custom_generate requests AND refinement loops.
    if (isCustomGenerate === true && custom_description) {
      return await handleCustomGenerate({
        effectiveUser,
        serviceSupabase,
        problemText,
        customDescription: custom_description,
        previousCode: previous_code,
        refinementInstruction: refinement_instruction,
      });
    }

    // ── Step 1: Fast-path A — primitive shape normalizer ─────────────────────
    // Detects "cube", "cylinder", "spacer", "standoff" etc. BEFORE any LLM call.
    // This ensures canonical primitives are never mis-routed.
    // IMPORTANT: This fast-path is NEVER bypassed by the AI router.
    const primitiveNorm = (!intake_family_candidate)
      ? tryNormalizePrimitive(problemText)
      : null;

    // ── Step 2: Fast-path B — pre-resolved intake from UniversalCreatorFlow ──
    const hasFastPath =
      (intake_family_candidate &&
      MVP_PART_FAMILIES.includes(intake_family_candidate as MvpPartFamily) &&
      intake_dimensions &&
      Object.keys(intake_dimensions).length > 0) ||
      !!primitiveNorm;

    let inventionResult: InventionResult;
    let aiRouterOutcome: string | null = null;
    let aiRouterExplanation: string | null = null;
    let aiRouterMissingDims: string[] = [];
    let aiRouterClarificationQuestion: string | null = null;
    let aiRouterConfidence: number | null = null;
    let aiRouterUsedWebSearch = false;

    if (primitiveNorm) {
      // ── Fast-path A: primitive normalizer matched ─────────────────────────
      inventionResult = {
        family: primitiveNorm.family,
        parameters: primitiveNorm.parameters,
        reasoning: primitiveNorm.reasoning,
        confidence: primitiveNorm.confidence,
        rejection_reason: null,
      };
      aiRouterOutcome = "primitive_fast_path";
    } else if (hasFastPath) {
      // ── Fast-path B: pre-resolved intake ─────────────────────────────────
      inventionResult = {
        family: intake_family_candidate as string,
        parameters: intake_dimensions as Record<string, number>,
        reasoning: `Pre-interpreted by UniversalCreatorFlow: ${problemText.slice(0, 200)}`,
        confidence: 0.9,
        rejection_reason: null,
      };
    } else {
      // ── Step 3: AI Router — LLM-powered routing ───────────────────────────
      const routerResult = await runAiRouter(problemText, openai);

      if (routerResult) {
        aiRouterOutcome = routerResult.outcome;
        aiRouterExplanation = routerResult.explanation;
        aiRouterMissingDims = routerResult.missing_dims;
        aiRouterClarificationQuestion = routerResult.clarification_question;
        aiRouterConfidence = routerResult.confidence;
        aiRouterUsedWebSearch = routerResult.used_web_search ?? false;

        // ── soft_match: return early — client shows editable dims UI ─────────
        if (routerResult.outcome === "soft_match") {
          // Fire-and-forget router log (non-blocking)
          void (async () => {
            try {
              await serviceSupabase.from("router_log").insert({
                raw_input: problemText,
                routed_family: routerResult.family,
                confidence: Math.round(routerResult.confidence),
                ai_explanation: routerResult.explanation,
                user_accepted: false,
                used_web_search: routerResult.used_web_search ?? false,
              });
            } catch { /* non-fatal */ }
          })();

          return NextResponse.json({
            status: "soft_match",
            family: routerResult.family,
            parameters: routerResult.parameters,
            explanation: routerResult.explanation,
            confidence: routerResult.confidence,
            missing_dims: routerResult.missing_dims,
            clarification_question: routerResult.clarification_question,
          });
        }

        // ── custom_generate: call CAD worker /generate-custom ─────────────────
        if (routerResult.outcome === "custom_generate") {
          // Fire-and-forget router log
          void (async () => {
            try {
              await serviceSupabase.from("router_log").insert({
                raw_input: problemText,
                routed_family: null,
                confidence: Math.round(routerResult.confidence),
                ai_explanation: `custom_generate: ${routerResult.explanation}`,
                user_accepted: false,
                used_web_search: routerResult.used_web_search ?? false,
              });
            } catch { /* non-fatal */ }
          })();

          return await handleCustomGenerate({
            effectiveUser,
            serviceSupabase,
            problemText,
            customDescription: routerResult.custom_description ?? problemText,
            previousCode: undefined,
            refinementInstruction: undefined,
          });
        }

        // ── unsupported: return early — client shows graceful dead-end ────────
        if (routerResult.outcome === "unsupported") {
          // Fire-and-forget router log (non-blocking)
          void (async () => {
            try {
              await serviceSupabase.from("router_log").insert({
                raw_input: problemText,
                routed_family: null,
                confidence: Math.round(routerResult.confidence),
                ai_explanation: routerResult.explanation,
                user_accepted: false,
                used_web_search: routerResult.used_web_search ?? false,
              });
            } catch { /* non-fatal */ }
          })();

          return NextResponse.json({
            status: "unsupported",
            explanation: routerResult.explanation,
            suggestions: EXAMPLE_PROMPTS.slice(0, 3),
          });
        }

        // ── direct_match: proceed to job creation ─────────────────────────────
        inventionResult = {
          family: routerResult.family as string,
          parameters: routerResult.parameters,
          reasoning: routerResult.explanation,
          confidence: routerResult.confidence / 100, // normalize to 0-1 for truth gate
          rejection_reason: null,
        };
      } else {
        // ── AI router failed — fall back to legacy LLM invention prompt ───────
        try {
          const completion = await openai.chat.completions.create({
            model: "gpt-4.1-mini",
            messages: [
              { role: "system", content: INVENTION_SYSTEM_PROMPT },
              {
                role: "user",
                content: `Problem: "${problemText}"\n\nDesign a 3D-printable solution.`,
              },
            ],
            response_format: { type: "json_object" },
            temperature: 0.3,
            max_tokens: 600,
          });

          const raw = completion.choices[0]?.message?.content ?? "{}";
          inventionResult = JSON.parse(raw) as InventionResult;
          aiRouterOutcome = "legacy_fallback";
        } catch (err) {
          console.error("LLM invention error:", err);
          return NextResponse.json(
            { error: "Invention engine failed. Please try again." },
            { status: 500 }
          );
        }
      }
    }

    // ── Step 4: Truth Gate — validate and reject unsafe designs ──────────────
    const truthGateInput = {
      family: inventionResult.family,
      dimensions: inventionResult.parameters ?? {},
      confidence: inventionResult.confidence ?? 0,
      missing_fields: [],
      is_demo_preset: false,
      llm_rejection_reason: inventionResult.rejection_reason ?? null,
    };
    const truthGateResult = runTruthGate(truthGateInput);
    const truthGateReceipt = formatTruthGateReceipt(truthGateResult, truthGateInput);

    if (truthGateResult.verdict === "REJECT" || truthGateResult.verdict === "CLARIFY") {
      // Log the rejected invention
      await serviceSupabase.from("invention_requests").insert({
        clerk_user_id: effectiveUser.id,
        problem_text: problemText,
        family: inventionResult.family ?? null,
        parameters: inventionResult.parameters ?? {},
        reasoning: inventionResult.reasoning ?? null,
        confidence: inventionResult.confidence ?? 0,
        status: "rejected",
        rejection_reason: truthGateResult.reason ?? "Truth Gate rejected",
      });

      return NextResponse.json(
        {
          rejected: true,
          reason: truthGateResult.reason,
          truth_label: truthGateResult.truth_label,
          verdict: truthGateResult.verdict,
          missing_dimensions: truthGateResult.missing_dimensions,
          confidence: inventionResult.confidence ?? 0,
          truth_gate_receipt: truthGateReceipt,
        },
        { status: 422 }
      );
    }

    // CONCEPT_ONLY: generate the job but mark it as concept-only
    const isConceptOnly = truthGateResult.verdict === "CONCEPT_ONLY";

    // ── Step 5: Create session → job → part_spec ─────────────────────────────

    // [STEP: session-create]
    console.log(`[invent] step=session-create clerk_user_id=${effectiveUser.id}`);
    const { data: session, error: sessionError } = await serviceSupabase
      .from("sessions")
      .insert({ clerk_user_id: effectiveUser.id, started_at: new Date().toISOString() })
      .select("id")
      .single();
    if (sessionError || !session) {
      console.error("[invent] FAIL step=session-create", JSON.stringify(sessionError));
      return NextResponse.json(
        { error: "Failed to create session", step: "session-create", detail: sessionError?.message },
        { status: 500 }
      );
    }
    console.log(`[invent] OK step=session-create session_id=${session.id}`);

    // [STEP: job-insert]
    console.log(`[invent] step=job-insert clerk_user_id=${effectiveUser.id} session_id=${session.id}`);
    const { data: job, error: jobError } = await serviceSupabase
      .from("jobs")
      .insert({
        clerk_user_id: effectiveUser.id,
        session_id: session.id,
        status: "draft",
        title: `Invention: ${problemText.slice(0, 60)}`,
        requested_family: inventionResult.family,
        selected_family: inventionResult.family,
        capability_id: `${inventionResult.family}_v1`,
        truth_label: truthGateResult.truth_label,
        truth_result: truthGateReceipt,
        is_demo_preset: false,
      })
      .select("id")
      .single();
    if (jobError || !job) {
      console.error("[invent] FAIL step=job-insert", JSON.stringify(jobError));
      return NextResponse.json(
        { error: "Failed to create job", step: "job-insert", detail: jobError?.message },
        { status: 500 }
      );
    }
    console.log(`[invent] OK step=job-insert job_id=${job.id}`);

    // [STEP: part-spec-insert]
    const { data: partSpec, error: specError } = await serviceSupabase
      .from("part_specs")
      .insert({
        job_id: job.id,
        family: inventionResult.family,
        units: "mm",
        dimensions_json: inventionResult.parameters,
        assumptions_json: [`Auto-invented from problem: "${problemText.slice(0, 100)}"`],
        missing_fields_json: [],
      })
      .select("id")
      .single();
    if (specError || !partSpec) {
      console.error("[invent] FAIL step=part-spec-insert", JSON.stringify(specError));
      return NextResponse.json(
        { error: "Failed to create part spec", step: "part-spec-insert", detail: specError?.message },
        { status: 500 }
      );
    }
    console.log(`[invent] OK step=part-spec-insert part_spec_id=${partSpec.id}`);

    // ── Step 6: Trigger CAD generation pipeline ───────────────────────────────

    // [STEP: profile-bootstrap]
    console.log(`[invent] step=profile-bootstrap clerk_user_id=${effectiveUser.id}`);
    const { data: existingProfile } = await serviceSupabase
      .from("profiles")
      .select("clerk_user_id")
      .eq("clerk_user_id", effectiveUser.id)
      .maybeSingle();
    if (!existingProfile) {
      const { error: insertProfileError } = await serviceSupabase
        .from("profiles")
        .insert({
          id: crypto.randomUUID(),
          clerk_user_id: effectiveUser.id,
          plan: "free",
          generations_this_month: 0,
          generation_month: new Date().toISOString().slice(0, 7),
        });
      if (insertProfileError && insertProfileError.code !== "23505") {
        console.warn("[invent] WARN step=profile-bootstrap (non-fatal)", JSON.stringify(insertProfileError));
      }
    }
    console.log(`[invent] OK step=profile-bootstrap`);

    // [STEP: profile-fetch]
    console.log(`[invent] step=profile-fetch clerk_user_id=${effectiveUser.id}`);
    const { data: profile, error: profileFetchError } = await serviceSupabase
      .from("profiles")
      .select("plan, generations_this_month, generation_month")
      .eq("clerk_user_id", effectiveUser.id)
      .single();
    if (profileFetchError) {
      console.error("[invent] WARN step=profile-fetch", JSON.stringify(profileFetchError));
    }
    console.log(`[invent] OK step=profile-fetch plan=${profile?.plan ?? "free"}`);

    const plan = profile?.plan ?? "free";
    const currentMonth = new Date().toISOString().slice(0, 7);
    const generationsThisMonth =
      profile?.generation_month === currentMonth
        ? (profile?.generations_this_month ?? 0)
        : 0;
    const limits: Record<string, number | null> = { free: 3, maker: 50, pro: null };
    const limit = limits[plan] ?? 3;

    // Access policy bypass check
    const bypass = await shouldBypassLimits(effectiveUser.email);
    if (bypass.bypassed) {
      console.log(`[invent] bypass active — reason: ${bypass.reason} — user: ${effectiveUser.email}`);
    }
    if (!bypass.bypassed && limit !== null && generationsThisMonth >= limit) {
      return NextResponse.json(
        {
          error: `Monthly generation limit reached (${limit} for ${plan} plan). Upgrade to continue.`,
          upgrade_required: true,
        },
        { status: 402 }
      );
    }

    // [STEP: cad-run-insert]
    console.log(`[invent] step=cad-run-insert job_id=${job.id}`);
    const { data: cadRun, error: runError } = await serviceSupabase
      .from("cad_runs")
      .insert({
        job_id: job.id,
        part_spec_id: partSpec.id,
        engine: "build123d",
        generator_name: inventionResult.family,
        generator_version: "1.0.0",
        status: "queued",
        normalized_params_json: inventionResult.parameters,
        validation_report_json: {},
      })
      .select()
      .single();
    if (runError || !cadRun) {
      console.error("[invent] FAIL step=cad-run-insert", JSON.stringify(runError));
      return NextResponse.json(
        { error: "Failed to create CAD run", step: "cad-run-insert", detail: runError?.message },
        { status: 500 }
      );
    }
    console.log(`[invent] OK step=cad-run-insert cad_run_id=${cadRun.id}`);

    // Update job status to generating
    await serviceSupabase
      .from("jobs")
      .update({ status: "generating", latest_run_id: cadRun.id })
      .eq("id", job.id);

    // [STEP: counter-update]
    console.log(`[invent] step=counter-update clerk_user_id=${effectiveUser.id} new_count=${generationsThisMonth + 1}`);
    await serviceSupabase
      .from("profiles")
      .update({
        generations_this_month: generationsThisMonth + 1,
        generation_month: currentMonth,
      })
      .eq("clerk_user_id", effectiveUser.id);

    // Trigger the pipeline
    let triggerRunId: string | null = null;
    if (process.env.TRIGGER_SECRET_KEY) {
      try {
        const { tasks } = await import("@trigger.dev/sdk/v3");
        const handle = await tasks.trigger("cad-generation-pipeline", {
          job_id: job.id,
          cad_run_id: cadRun.id,
          part_spec_id: partSpec.id,
          variant_type: "requested",
          engine: "build123d",
        });
        triggerRunId = handle.id;
      } catch (err) {
        console.error("Trigger.dev dispatch failed:", err);
        // Non-fatal — the cad_run stays queued for manual recovery
      }
    }

    // ── Step 7: Save invention_request audit record ───────────────────────────
    const { data: inventionRecord } = await serviceSupabase
      .from("invention_requests")
      .insert({
        clerk_user_id: effectiveUser.id,
        problem_text: problemText,
        family: inventionResult.family,
        parameters: inventionResult.parameters,
        reasoning: inventionResult.reasoning,
        confidence: inventionResult.confidence,
        job_id: job.id,
        status: "generating",
      })
      .select("id")
      .single();

    // ── Step 8: Fire-and-forget router_log insert ─────────────────────────────
    void (async () => {
      try {
        await serviceSupabase.from("router_log").insert({
          raw_input: problemText,
          routed_family: inventionResult.family,
          confidence: aiRouterConfidence !== null
            ? Math.round(aiRouterConfidence)
            : Math.round((inventionResult.confidence ?? 0) * 100),
          ai_explanation: aiRouterExplanation ?? inventionResult.reasoning,
          user_accepted: true,
          final_family: inventionResult.family,
          used_web_search: aiRouterUsedWebSearch,
        });
      } catch { /* non-fatal — never block main flow */ }
    })();

    // ── Step 9: Return result ─────────────────────────────────────────────────
    return NextResponse.json({
      invention_id: inventionRecord?.id ?? null,
      job_id: job.id,
      cad_run_id: cadRun.id,
      trigger_run_id: triggerRunId,
      family: inventionResult.family,
      family_description: PART_FAMILY_DESCRIPTIONS[inventionResult.family as MvpPartFamily],
      parameters: inventionResult.parameters,
      reasoning: inventionResult.reasoning,
      confidence: inventionResult.confidence,
      truth_label: truthGateResult.truth_label,
      is_concept_only: isConceptOnly,
      truth_gate_receipt: truthGateReceipt,
      // AI router metadata (informational)
      ai_router_outcome: aiRouterOutcome,
      ai_router_explanation: aiRouterExplanation,
      status: "generating",
    });
  } catch (err) {
    console.error("Invent endpoint error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom generate handler
// ─────────────────────────────────────────────────────────────────────────────

interface CustomGenerateHandlerArgs {
  effectiveUser: { id: string; email: string | null };
  serviceSupabase: ReturnType<typeof createServiceClient>;
  problemText: string;
  customDescription: string;
  previousCode?: string;
  refinementInstruction?: string;
}

async function handleCustomGenerate({
  effectiveUser,
  serviceSupabase,
  problemText,
  customDescription,
  previousCode,
  refinementInstruction,
}: CustomGenerateHandlerArgs): Promise<NextResponse> {
  // Create a job record for tracking
  const { data: session, error: sessionError } = await serviceSupabase
    .from("sessions")
    .insert({ clerk_user_id: effectiveUser.id, started_at: new Date().toISOString() })
    .select("id")
    .single();
  if (sessionError || !session) {
    return NextResponse.json(
      { error: "Failed to create session for custom generate", detail: sessionError?.message },
      { status: 500 }
    );
  }

  const { data: job, error: jobError } = await serviceSupabase
    .from("jobs")
    .insert({
      clerk_user_id: effectiveUser.id,
      session_id: session.id,
      status: "generating",
      title: `Custom: ${problemText.slice(0, 60)}`,
      requested_family: "custom",
      selected_family: "custom",
      capability_id: "custom_v1",
      truth_label: "CUSTOM_GENERATE",
      truth_result: { verdict: "CUSTOM_GENERATE", reason: "LLM CadQuery generation" },
      is_demo_preset: false,
    })
    .select("id")
    .single();
  if (jobError || !job) {
    return NextResponse.json(
      { error: "Failed to create job for custom generate", detail: jobError?.message },
      { status: 500 }
    );
  }

  // Call the CAD worker /generate-custom endpoint
  const cadWorkerUrl = getCadWorkerUrl();
  let cadWorkerResult: {
    status: string;
    storage_path?: string;
    generated_code?: string;
    plain_english_summary?: string;
    error?: string;
    cad_run_id?: string;
    attempts?: number;
    duration_ms?: number;
  };

  try {
    const cadResponse = await fetch(`${cadWorkerUrl}/generate-custom`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: customDescription,
        job_id: job.id,
        previous_code: previousCode ?? null,
        refinement_instruction: refinementInstruction ?? null,
      }),
      // 120s timeout for LLM + CadQuery generation
      signal: AbortSignal.timeout(120_000),
    });

    if (!cadResponse.ok) {
      const errText = await cadResponse.text().catch(() => "unknown error");
      throw new Error(`CAD worker returned ${cadResponse.status}: ${errText.slice(0, 200)}`);
    }

    cadWorkerResult = await cadResponse.json() as typeof cadWorkerResult;
  } catch (err) {
    console.error("[invent] custom generate CAD worker call failed:", err);
    // Update job to failed
    await serviceSupabase
      .from("jobs")
      .update({ status: "failed" })
      .eq("id", job.id);

    return NextResponse.json({
      status: "custom_generate_failed",
      job_id: job.id,
      error: `CAD worker unavailable: ${(err as Error).message}`,
    });
  }

  if (cadWorkerResult.status !== "success") {
    await serviceSupabase
      .from("jobs")
      .update({ status: "failed" })
      .eq("id", job.id);

    return NextResponse.json({
      status: "custom_generate_failed",
      job_id: job.id,
      error: cadWorkerResult.error ?? "CAD generation failed",
    });
  }

  // Record the artifact and capture the artifact_id for the viewer
  let artifactId: string | null = null;
  if (cadWorkerResult.storage_path) {
    const { data: artifactRow } = await serviceSupabase
      .from("artifacts")
      .insert({
        job_id: job.id,
        cad_run_id: cadWorkerResult.cad_run_id ?? crypto.randomUUID(),
        kind: "stl",
        storage_path: cadWorkerResult.storage_path,
        mime_type: "model/stl",
        file_size_bytes: 0,
      })
      .select("id")
      .single();
    artifactId = artifactRow?.id ?? null;
  }

  // Update job to done
  await serviceSupabase
    .from("jobs")
    .update({ status: "done" })
    .eq("id", job.id);

  return NextResponse.json({
    status: "custom_generate_ready",
    job_id: job.id,
    artifact_id: artifactId,
    storage_path: cadWorkerResult.storage_path,
    generated_code: cadWorkerResult.generated_code,
    plain_english_summary: cadWorkerResult.plain_english_summary,
    cad_run_id: cadWorkerResult.cad_run_id,
    attempts: cadWorkerResult.attempts,
    duration_ms: cadWorkerResult.duration_ms,
  });
}
