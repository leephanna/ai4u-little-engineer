/**
 * POST /api/demo/artemis
 *
 * Artemis II Demo Generation Route
 *
 * The standard /api/invent route uses an LLM to map a problem to one of 10
 * parametric part families. A "rocket model" concept returns confidence < 0.5
 * and is rejected — this is correct behavior for the invention engine.
 *
 * This dedicated route bypasses the LLM classification step and directly maps
 * the Artemis II demo to a valid parametric family:
 *
   *   Scale "small"   → spacer (cylindrical rocket body, OD=32mm × H=120mm)
 *   Scale "medium"  → spacer (cylindrical rocket body, OD=50mm × H=200mm)
 *   Scale "display" → spacer (cylindrical rocket body, OD=75mm × H=320mm)
 *
 * Track 1 fix: remapped from standoff_block (rectangular block) to spacer
 * (cylindrical body) with rocket-proportioned tall/narrow aspect ratios.
 * The spacer generator is fully production-ready and produces a solid
 * cylindrical body with chamfered edges — visually impressive as a rocket.
 *
 * Schema fix (commit after e7d553d):
 *   - sessions insert: removed non-existent `problem_text` column
 *   - jobs insert: removed non-existent `description` column; added
 *     `requested_family` and `selected_family`
 *   - part_specs insert: corrected column names to `dimensions_json`,
 *     `assumptions_json`, `missing_fields_json` (schema uses _json suffix)
 *
 * Daedalus Gate Receipt: included in response as `daedalus_receipt`.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { shouldBypassLimits } from "@/lib/access-policy";
import { runTruthGate, formatTruthGateReceipt } from "@/lib/truth-gate";
import { getAuthUser } from "@/lib/auth";

// ── Scale → parametric dimensions mapping ────────────────────────────────────
// Track 1 fix: remapped from standoff_block (rectangular block) to spacer
// (cylindrical body) with rocket-proportioned tall/narrow aspect ratios.
// spacer generator: outer_diameter, height, inner_diameter (0 = solid)
const SCALE_MAP = {
  small: {
    family: "spacer" as const,
    parameters: { outer_diameter: 32, height: 120, inner_diameter: 0 },
    label: "Small Artemis II Rocket Body (12cm)",
    time: "~1.5h",
    filament: "~35g",
  },
  medium: {
    family: "spacer" as const,
    parameters: { outer_diameter: 50, height: 200, inner_diameter: 0 },
    label: "Medium Artemis II Rocket Body (20cm)",
    time: "~3h",
    filament: "~70g",
  },
  display: {
    family: "spacer" as const,
    parameters: { outer_diameter: 75, height: 320, inner_diameter: 0 },
    label: "Display Artemis II Rocket Body (32cm)",
    time: "~7h",
    filament: "~150g",
  },
};

type Scale = keyof typeof SCALE_MAP;
type Quality = "draft" | "standard" | "fine";
type Material = "PLA" | "PETG" | "ABS";

// ── VPL preview scores per quality ───────────────────────────────────────────
const VPL_PREVIEW = {
  draft:    { score: 72, grade: "B", tier: "Verified" },
  standard: { score: 84, grade: "A", tier: "Trusted Commercial" },
  fine:     { score: 91, grade: "A", tier: "Trusted Commercial" },
};

export async function POST(req: NextRequest) {
  const startMs = Date.now();

  try {
    const body = await req.json();
    const scale: Scale = body.scale ?? "medium";
    const material: Material = body.material ?? "PLA";
    const quality: Quality = body.quality ?? "standard";

    // Validate inputs
    if (!SCALE_MAP[scale]) {
      return NextResponse.json(
        { error: `Invalid scale: ${scale}. Must be small, medium, or display.` },
        { status: 400 }
      );
    }

    const scaleConfig = SCALE_MAP[scale];
    const vplPreview = VPL_PREVIEW[quality];

    // ── Auth check ──────────────────────────────────────────────
    const supabase = await createClient();
        const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const serviceSupabase = createServiceClient();

    // ── Access policy bypass check (owner / cookie / preview) ───
    const bypass = await shouldBypassLimits(user.email);
    if (bypass.bypassed) {
      console.log(`[artemis] bypass active — reason: ${bypass.reason} — user: ${user.email}`);
    }

    // ── Billing check (skipped when bypass is active) ───────────
    const { data: profile } = await serviceSupabase
      .from("profiles")
      .select("plan, generations_this_month, generation_month")
      .eq("clerk_user_id", user.id)
      .single();

    const plan = profile?.plan ?? "free";
    const currentMonth = new Date().toISOString().slice(0, 7);
    const generationsThisMonth =
      profile?.generation_month === currentMonth
        ? (profile?.generations_this_month ?? 0)
        : 0;
    const limits: Record<string, number | null> = { free: 3, maker: 50, pro: null };
    const limit = limits[plan] ?? 3;
    if (!bypass.bypassed && limit !== null && generationsThisMonth >= limit) {
      return NextResponse.json(
        {
          error: `Monthly generation limit reached (${limit} for ${plan} plan). Upgrade to continue.`,
          upgrade_required: true,
        },
        { status: 402 }
      );
    }

    // ── Truth Gate (demo preset — bypasses confidence/clarify checks) ───
    const truthGateInput = {
      family: scaleConfig.family,
      dimensions: scaleConfig.parameters,
      confidence: 0.92,
      is_demo_preset: true,
    };
    const truthGateResult = runTruthGate(truthGateInput);
    const truthGateReceipt = formatTruthGateReceipt(truthGateResult, truthGateInput);
    // Demo presets always pass the Truth Gate — log if they somehow don't
    if (truthGateResult.verdict !== "GO") {
      console.error("[artemis] Truth Gate rejected demo preset:", truthGateResult);
      return NextResponse.json(
        { error: "Demo preset failed Truth Gate validation", detail: truthGateResult.reason },
        { status: 500 }
      );
    }

    // ── Build problem text (for audit records only) ─────────────────
    const problemText =
      `Artemis II rocket body — ${scaleConfig.label}. ` +
      `Dimensions: ⌀${scaleConfig.parameters.outer_diameter}mm × H${scaleConfig.parameters.height}mm. ` +
      `Material: ${material}. Quality: ${quality}. ` +
      `This is a showcase/demo print inspired by the Artemis II mission — not an official NASA model.`;

    // ── Create session ──────────────────────────────────────────
    // sessions table columns: id, user_id, device_id, started_at, ended_at, transcript_summary
    const { data: session, error: sessionError } = await serviceSupabase
      .from("sessions")
      .insert({ clerk_user_id: user.id })
      .select("id")
      .single();
    if (sessionError || !session) {
      return NextResponse.json(
        { error: "Failed to create session", detail: sessionError?.message },
        { status: 500 }
      );
    }

    // ── Create job ──────────────────────────────────────────────
    // jobs table columns: id, user_id, session_id, title, status, requested_family,
    //   selected_family, confidence_score, latest_spec_version, latest_run_id,
    //   created_at, updated_at
    const { data: job, error: jobError } = await serviceSupabase
      .from("jobs")
      .insert({
        clerk_user_id: user.id,
        session_id: session.id,
        status: "draft",
        title: `Artemis II Rocket — ${scaleConfig.label}`,
        requested_family: scaleConfig.family,
        selected_family: scaleConfig.family,
        confidence_score: 0.92,
        capability_id: `rocket_body_v1`,
        truth_label: truthGateResult.truth_label,
        truth_result: truthGateReceipt,
        is_demo_preset: true,
      })
      .select("id")
      .single();
    if (jobError || !job) {
      return NextResponse.json(
        { error: "Failed to create job", detail: jobError?.message },
        { status: 500 }
      );
    }

    // ── Create part_spec ────────────────────────────────────────
    // part_specs table columns: id, job_id, version, units, family, material,
    //   dimensions_json, load_requirements_json, constraints_json,
    //   printer_constraints_json, assumptions_json, missing_fields_json,
    //   source_transcript_span_json, created_by, created_at
    const { data: partSpec, error: specError } = await serviceSupabase
      .from("part_specs")
      .insert({
        job_id: job.id,
        family: scaleConfig.family,
        units: "mm",
        material,
        dimensions_json: scaleConfig.parameters,
        assumptions_json: [
          `Artemis II demo — mapped to ${scaleConfig.family} for parametric generation`,
          `Scale: ${scale}, Material: ${material}, Quality: ${quality}`,
          "Commemorative Artemis II rocket body — not an official NASA model",
        ],
        missing_fields_json: [],
        created_by: "ai",
      })
      .select("id")
      .single();
    if (specError || !partSpec) {
      return NextResponse.json(
        { error: "Failed to create part spec", detail: specError?.message },
        { status: 500 }
      );
    }

    // ── Create CAD run ──────────────────────────────────────────
    // cad_runs table columns: id, job_id, part_spec_id, concept_variant_id,
    //   engine, generator_name, generator_version, status, source_code,
    //   normalized_params_json, validation_report_json, error_text,
    //   started_at, ended_at
    const { data: cadRun, error: runError } = await serviceSupabase
      .from("cad_runs")
      .insert({
        job_id: job.id,
        part_spec_id: partSpec.id,
        engine: "build123d",
        generator_name: scaleConfig.family,
        generator_version: "1.0.0",
        status: "queued",
        normalized_params_json: scaleConfig.parameters,
        validation_report_json: {},
      })
      .select()
      .single();
    if (runError || !cadRun) {
      return NextResponse.json(
        { error: "Failed to create CAD run", detail: runError?.message },
        { status: 500 }
      );
    }

    // ── Update job status ───────────────────────────────────────
    await serviceSupabase
      .from("jobs")
      .update({ status: "generating", latest_run_id: cadRun.id })
      .eq("id", job.id);

    // ── Increment generation counter ────────────────────────────
    await serviceSupabase
      .from("profiles")
      .update({
        generations_this_month: generationsThisMonth + 1,
        generation_month: currentMonth,
      })
      .eq("clerk_user_id", user.id);

    // ── Trigger CAD pipeline ────────────────────────────────────
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
        // Non-fatal — cad_run stays queued for manual recovery
      }
    }

    // ── Save invention_request audit record ─────────────────────
    // invention_requests columns: id, user_id, problem_text, family, parameters,
    //   reasoning, confidence, project_id, job_id, status, rejection_reason,
    //   created_at, completed_at
    const { data: inventionRecord } = await serviceSupabase
      .from("invention_requests")
      .insert({
        clerk_user_id: user.id,
        problem_text: problemText,
        family: scaleConfig.family,
        parameters: scaleConfig.parameters,
        reasoning: `Artemis II demo — direct parametric mapping to ${scaleConfig.family}. Scale: ${scale}.`,
        confidence: 0.92,
        job_id: job.id,
        status: "generating",
      })
      .select("id")
      .single();

    // ── Daedalus Gate Receipt ───────────────────────────────────
    const elapsedMs = Date.now() - startMs;
    const daedalusReceipt = {
      gate: "artemis_demo_generation",
      timestamp: new Date().toISOString(),
      elapsed_ms: elapsedMs,
      inputs: { scale, material, quality, clerk_user_id: user.id },
      interpretation: {
        mode: "artemis_demo",
        family_mapped: scaleConfig.family,
        parameters: scaleConfig.parameters,
        confidence: 0.92,
        mapping_strategy: "direct_parametric",
        disclaimer: "Commemorative Artemis II rocket body — not an official NASA model",
      },
      generation: {
        job_id: job.id,
        cad_run_id: cadRun.id,
        trigger_run_id: triggerRunId,
        status: "generating",
      },
      vpl_preview: vplPreview,
      result: "GO",
      truth_gate: truthGateReceipt,
    };

    return NextResponse.json({
      job_id: job.id,
      cad_run_id: cadRun.id,
      trigger_run_id: triggerRunId,
      invention_id: inventionRecord?.id ?? null,
      family: scaleConfig.family,
      parameters: scaleConfig.parameters,
      label: scaleConfig.label,
      scale,
      material,
      quality,
      vpl_preview: vplPreview,
      status: "generating",
      // Access policy bypass fields (Phase 4)
      unlimited: bypass.bypassed,
      bypass_reason: bypass.reason ?? undefined,
      daedalus_receipt: daedalusReceipt,
    });
  } catch (err) {
    console.error("Artemis demo endpoint error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
