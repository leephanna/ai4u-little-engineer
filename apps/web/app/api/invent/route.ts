/**
 * POST /api/invent
 *
 * Auto-Invention Engine — converts a plain-English problem description into a
 * printable CAD solution using structured JSON output from an LLM.
 *
 * Flow:
 *   1. Parse problem text
 *   2. LLM → structured JSON { family, parameters, reasoning, confidence }
 *   3. Validate family + parameters against capability_registry
 *   4. Reject impossible/unsafe designs
 *   5. Create session → job → part_spec → trigger CAD pipeline
 *   6. Save invention_request audit record
 *   7. Return { invention_id, job_id, family, parameters, reasoning, confidence }
 *
 * The client polls /api/jobs/[jobId] for CAD generation status.
 * On completion, the job page shows the STL + explanation + save/publish/sell actions.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import OpenAI from "openai";
import {
  REQUIRED_DIMENSIONS,
  PART_FAMILY_DESCRIPTIONS,
  MVP_PART_FAMILIES,
  type MvpPartFamily,
} from "@ai4u/shared";

// ─────────────────────────────────────────────────────────────
// LLM Invention Prompt
// ─────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────
// Validation helpers
// ─────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY ?? "placeholder",
  });

  try {
    const supabase = await createClient();
    const serviceSupabase = createServiceClient();

    // Auth check
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse request body
    // Accepts two payload shapes:
    //   1. Old shape: { problem: string }  — from InventionForm / direct API calls
    //   2. New shape: { text: string, intake_family_candidate?: string,
    //                   intake_dimensions?: Record<string, number> }
    //                — from UniversalCreatorFlow after interpretation
    const body = await request.json();
    const {
      problem,
      text,
      intake_family_candidate,
      intake_dimensions,
    } = body as {
      problem?: string;
      text?: string;
      intake_family_candidate?: string;
      intake_dimensions?: Record<string, number>;
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

    // ── Step 1: LLM → structured invention (or fast-path) ───────
    // Fast-path: if the caller already resolved the family + dimensions (e.g. from
    // the UniversalCreatorFlow interpretation engine), skip the LLM call entirely.
    const hasFastPath =
      intake_family_candidate &&
      MVP_PART_FAMILIES.includes(intake_family_candidate as MvpPartFamily) &&
      intake_dimensions &&
      Object.keys(intake_dimensions).length > 0;

    let inventionResult: InventionResult;
    if (hasFastPath) {
      // Build InventionResult directly from the pre-resolved intake data
      inventionResult = {
        family: intake_family_candidate as string,
        parameters: intake_dimensions as Record<string, number>,
        reasoning: `Pre-interpreted by UniversalCreatorFlow: ${problemText.slice(0, 200)}`,
        confidence: 0.9,
        rejection_reason: null,
      };
    } else {
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
      } catch (err) {
        console.error("LLM invention error:", err);
        return NextResponse.json(
          { error: "Invention engine failed. Please try again." },
          { status: 500 }
        );
      }
    }

    // ── Step 2: Validate and reject unsafe designs ──────────────
    if (
      !inventionResult.confidence ||
      inventionResult.confidence < 0.5 ||
      inventionResult.rejection_reason
    ) {
      // Log the rejected invention
      await serviceSupabase.from("invention_requests").insert({
        user_id: user.id,
        problem_text: problemText,
        family: inventionResult.family ?? null,
        parameters: inventionResult.parameters ?? {},
        reasoning: inventionResult.reasoning ?? null,
        confidence: inventionResult.confidence ?? 0,
        status: "rejected",
        rejection_reason:
          inventionResult.rejection_reason ??
          "Low confidence — problem may not be solvable with available part families.",
      });

      return NextResponse.json(
        {
          rejected: true,
          reason:
            inventionResult.rejection_reason ??
            "This problem cannot be solved with the available part families. Try describing a simpler mechanical need.",
          confidence: inventionResult.confidence ?? 0,
        },
        { status: 422 }
      );
    }

    const validationError = validateInventionResult(inventionResult);
    if (validationError) {
      await serviceSupabase.from("invention_requests").insert({
        user_id: user.id,
        problem_text: problemText,
        family: inventionResult.family ?? null,
        parameters: inventionResult.parameters ?? {},
        reasoning: inventionResult.reasoning ?? null,
        confidence: inventionResult.confidence ?? 0,
        status: "rejected",
        rejection_reason: validationError,
      });

      return NextResponse.json(
        { rejected: true, reason: validationError, confidence: inventionResult.confidence },
        { status: 422 }
      );
    }

    // ── Step 3: Create session → job → part_spec ────────────────
    // Create a session
    const { data: session, error: sessionError } = await serviceSupabase
      .from("sessions")
      .insert({ user_id: user.id, started_at: new Date().toISOString() })
      .select("id")
      .single();

    if (sessionError || !session) {
      console.error("Session create error:", sessionError);
      return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
    }

    // Create a job
    const { data: job, error: jobError } = await serviceSupabase
      .from("jobs")
      .insert({
        user_id: user.id,
        session_id: session.id,
        status: "draft",
        title: `Invention: ${problemText.slice(0, 60)}`,
        description: inventionResult.reasoning,
      })
      .select("id")
      .single();

    if (jobError || !job) {
      console.error("Job create error:", jobError);
      return NextResponse.json({ error: "Failed to create job" }, { status: 500 });
    }

    // Create a part_spec
    const { data: partSpec, error: specError } = await serviceSupabase
      .from("part_specs")
      .insert({
        job_id: job.id,
        family: inventionResult.family,
        units: "mm",
        dimensions: inventionResult.parameters,
        assumptions: [`Auto-invented from problem: "${problemText.slice(0, 100)}"`],
        missing_fields: [],
        confidence: inventionResult.confidence,
        source: "invention_engine",
      })
      .select("id")
      .single();

    if (specError || !partSpec) {
      console.error("Part spec create error:", specError);
      return NextResponse.json({ error: "Failed to create part spec" }, { status: 500 });
    }

    // ── Step 4: Trigger CAD generation pipeline ─────────────────
    // Check billing entitlement
    const { data: profile } = await serviceSupabase
      .from("profiles")
      .select("plan, generations_this_month, generation_month")
      .eq("id", user.id)
      .single();

    const plan = profile?.plan ?? "free";
    const currentMonth = new Date().toISOString().slice(0, 7);
    const generationsThisMonth =
      profile?.generation_month === currentMonth
        ? (profile?.generations_this_month ?? 0)
        : 0;

    const limits: Record<string, number | null> = { free: 3, maker: 50, pro: null };
    const limit = limits[plan] ?? 3;
    if (limit !== null && generationsThisMonth >= limit) {
      return NextResponse.json(
        {
          error: `Monthly generation limit reached (${limit} for ${plan} plan). Upgrade to continue.`,
          upgrade_required: true,
        },
        { status: 402 }
      );
    }

    // Create CAD run
    const { data: cadRun, error: runError } = await serviceSupabase
      .from("cad_runs")
      .insert({
        job_id: job.id,
        part_spec_id: partSpec.id,
        engine: "build123d",
        generator_name: inventionResult.family,
        generator_version: "1.0.0",
        status: "queued",
        normalized_params_json: {},
        validation_report_json: {},
      })
      .select()
      .single();

    if (runError || !cadRun) {
      console.error("CAD run create error:", runError);
      return NextResponse.json({ error: "Failed to create CAD run" }, { status: 500 });
    }

    // Update job status
    await serviceSupabase
      .from("jobs")
      .update({ status: "generating", latest_run_id: cadRun.id })
      .eq("id", job.id);

    // Increment generation counter
    await serviceSupabase
      .from("profiles")
      .update({
        generations_this_month: generationsThisMonth + 1,
        generation_month: currentMonth,
      })
      .eq("id", user.id);

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

    // ── Step 5: Save invention_request audit record ─────────────
    const { data: inventionRecord } = await serviceSupabase
      .from("invention_requests")
      .insert({
        user_id: user.id,
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

    // ── Step 6: Return result ────────────────────────────────────
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
      status: "generating",
    });
  } catch (err) {
    console.error("Invent endpoint error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
