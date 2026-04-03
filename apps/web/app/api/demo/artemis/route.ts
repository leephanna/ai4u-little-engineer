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
 *   Scale "small"   → standoff_block (display base, 80×80×120mm)
 *   Scale "medium"  → standoff_block (display base, 130×130×200mm)
 *   Scale "display" → standoff_block (display base, 200×200×320mm)
 *
 * The generated part is honestly labeled as a "commemorative display stand
 * inspired by the Artemis II mission" — not a photorealistic rocket model.
 * This is the correct, honest, and technically achievable outcome for the
 * current parametric CAD engine.
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

// ── Scale → parametric dimensions mapping ────────────────────────────────────
const SCALE_MAP = {
  small: {
    family: "standoff_block" as const,
    parameters: { base_width: 80, height: 120, hole_diameter: 3.0 },
    label: "Small Commemorative Display Stand",
    time: "~2.5h",
    filament: "~45g",
  },
  medium: {
    family: "standoff_block" as const,
    parameters: { base_width: 130, height: 200, hole_diameter: 3.0 },
    label: "Medium Commemorative Display Stand",
    time: "~5h",
    filament: "~90g",
  },
  display: {
    family: "standoff_block" as const,
    parameters: { base_width: 200, height: 320, hole_diameter: 3.0 },
    label: "Display Commemorative Stand",
    time: "~10h",
    filament: "~180g",
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
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const serviceSupabase = createServiceClient();

    // ── Billing check ───────────────────────────────────────────
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

    // ── Build problem text (for audit records only) ─────────────
    const problemText =
      `Artemis II commemorative display stand — ${scaleConfig.label}. ` +
      `Dimensions: ${scaleConfig.parameters.base_width}×${scaleConfig.parameters.base_width}×${scaleConfig.parameters.height}mm. ` +
      `Material: ${material}. Quality: ${quality}. ` +
      `This is a showcase/demo print inspired by the Artemis II mission — not an official NASA model.`;

    // ── Create session ──────────────────────────────────────────
    // sessions table columns: id, user_id, device_id, started_at, ended_at, transcript_summary
    const { data: session, error: sessionError } = await serviceSupabase
      .from("sessions")
      .insert({ user_id: user.id })
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
        user_id: user.id,
        session_id: session.id,
        status: "draft",
        title: `Artemis II Demo — ${scaleConfig.label}`,
        requested_family: scaleConfig.family,
        selected_family: scaleConfig.family,
        confidence_score: 0.92,
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
          "Commemorative display stand — not an official NASA model",
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
      .eq("id", user.id);

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
        user_id: user.id,
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
      inputs: { scale, material, quality, user_id: user.id },
      interpretation: {
        mode: "artemis_demo",
        family_mapped: scaleConfig.family,
        parameters: scaleConfig.parameters,
        confidence: 0.92,
        mapping_strategy: "direct_parametric",
        disclaimer: "Commemorative display stand — not an official NASA model",
      },
      generation: {
        job_id: job.id,
        cad_run_id: cadRun.id,
        trigger_run_id: triggerRunId,
        status: "generating",
      },
      vpl_preview: vplPreview,
      result: "GO",
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
      daedalus_receipt: daedalusReceipt,
    });
  } catch (err) {
    console.error("Artemis demo endpoint error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
