/**
 * POST /api/mobile/confirm-spec
 *
 * Creates a job + part_spec row from a confirmed PartSpecDraft.
 * Returns the job object including part_spec_id so the mobile app
 * can immediately call /api/jobs/[id]/generate.
 *
 * Intelligence Layer (v2):
 *   - Reads dimension requirements from capability_registry (not hardcoded)
 *   - Writes a decision_ledger row (step='confirm') — fire-and-forget
 *   - Writes a design_learning_records row — fire-and-forget
 *   - Increments capability_registry.usage_count — fire-and-forget
 *
 * Auth: Bearer token.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { MVP_PART_FAMILIES, REQUIRED_DIMENSIONS } from "@ai4u/shared";

function getServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/** Fire-and-forget: write a decision_ledger row. Never throws. */
async function writeDecisionLedger(
  jobId: string | null,
  step: string,
  inputs: Record<string, unknown>,
  outputs: Record<string, unknown>,
  reason: string
): Promise<void> {
  try {
    const svc = getServiceClient();
    await svc.from("decision_ledger").insert({
      job_id: jobId ?? null,
      step,
      decision_reason: reason,
      inputs,
      outputs,
    });
  } catch {
    // Non-blocking
  }
}

/** Fire-and-forget: write a design_learning_records row. Never throws. */
async function writeLearningRecord(
  userId: string,
  jobId: string,
  spec: Record<string, unknown>,
  conversationData: Record<string, unknown>
): Promise<void> {
  try {
    const svc = getServiceClient();
    await svc.from("design_learning_records").insert({
      user_id: userId,
      job_id: jobId,
      transcript: conversationData.transcript ?? null,
      parsed_intent: conversationData.parsed_intent ?? {},
      final_spec: spec,
      spec_corrections: conversationData.spec_corrections ?? [],
      clarification_count: conversationData.clarification_count ?? 0,
      model_version: "gpt-4.1-mini",
      prompt_version: conversationData.prompt_version ?? "v1.0",
      generation_status: "pending",
      completion_time_ms: conversationData.completion_time_ms ?? null,
    });
  } catch {
    // Non-blocking
  }
}

/** Fire-and-forget: increment usage_count for a capability. Never throws. */
async function incrementCapabilityUsage(family: string): Promise<void> {
  try {
    const svc = getServiceClient();
    await svc
      .from("capability_registry")
      .update({ usage_count: svc.rpc("increment_capability_usage", { p_family: family }) })
      .eq("family", family);
  } catch {
    // Non-blocking
  }
}

export async function POST(request: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { spec, conversation_data } = body;

    if (!spec?.family) {
      return NextResponse.json(
        { error: "spec.family is required" },
        { status: 400 }
      );
    }
    if (!MVP_PART_FAMILIES.includes(spec.family)) {
      return NextResponse.json(
        { error: `Unsupported part family: ${spec.family}` },
        { status: 400 }
      );
    }

    // ── Load dimension requirements from capability_registry ──
    let requiredDims: string[] =
      REQUIRED_DIMENSIONS[spec.family as keyof typeof REQUIRED_DIMENSIONS] ?? [];
    try {
      const svc = getServiceClient();
      const { data: cap } = await svc
        .from("capability_registry")
        .select("required_dimensions")
        .eq("family", spec.family)
        .single();
      if (cap?.required_dimensions && Array.isArray(cap.required_dimensions)) {
        requiredDims = cap.required_dimensions as string[];
      }
    } catch {
      // Use static fallback
    }

    // ── Validate all required dimensions are present ──────────
    const missing = requiredDims.filter(
      (f: string) =>
        spec.dimensions?.[f] === undefined ||
        spec.dimensions?.[f] === null ||
        isNaN(spec.dimensions?.[f])
    );
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required dimensions: ${missing.join(", ")}` },
        { status: 400 }
      );
    }

    const serviceClient = getServiceClient();

    // ── Create job row ────────────────────────────────────────
    const { data: job, error: jobErr } = await serviceClient
      .from("jobs")
      .insert({
        user_id: user.id,
        status: "draft",
        title: `${spec.family.replace(/_/g, " ")} — mobile`,
        source: "mobile",
      })
      .select()
      .single();

    if (jobErr || !job) {
      console.error("Failed to create job:", jobErr);
      return NextResponse.json(
        { error: "Failed to create job" },
        { status: 500 }
      );
    }

    // ── Create part_spec row ──────────────────────────────────
    const { data: partSpec, error: specErr } = await serviceClient
      .from("part_specs")
      .insert({
        job_id: job.id,
        user_id: user.id,
        family: spec.family,
        dimensions_json: spec.dimensions,
        units: spec.units || "mm",
        material: spec.material || "Unknown",
        source: "mobile_voice",
      })
      .select()
      .single();

    if (specErr || !partSpec) {
      console.error("Failed to create part_spec:", specErr);
      return NextResponse.json(
        { error: "Failed to create part spec" },
        { status: 500 }
      );
    }

    // ── Intelligence Layer writes (all fire-and-forget) ───────
    void writeDecisionLedger(
      job.id,
      "confirm",
      {
        user_id: user.id,
        family: spec.family,
        dimension_count: Object.keys(spec.dimensions ?? {}).length,
        units: spec.units ?? "mm",
        clarification_count: conversation_data?.clarification_count ?? 0,
      },
      {
        job_id: job.id,
        part_spec_id: partSpec.id,
        status: "draft",
      },
      `User confirmed spec for ${spec.family} with ${Object.keys(spec.dimensions ?? {}).length} dimensions`
    );

    void writeLearningRecord(user.id, job.id, spec, conversation_data ?? {});
    void incrementCapabilityUsage(spec.family);

    return NextResponse.json({
      ...job,
      part_spec_id: partSpec.id,
    });
  } catch (err: unknown) {
    console.error("[/api/mobile/confirm-spec]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
