/**
 * POST /api/jobs/[jobId]/revise
 *
 * Phase 2D: Revision / iteration flow.
 *
 * Accepts { feedback, base_version, family }
 * - Calls the LLM to produce an updated PartSpec from the original + revision command
 * - Creates a new part_spec version in DB
 * - Triggers a new cad-generation-pipeline Trigger.dev task
 * - Returns { jobId, newVersion }
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import OpenAI from "openai";
import { tasks } from "@trigger.dev/sdk/v3";

interface ReviseBody {
  feedback: string;
  base_version: number;
  family?: string;
}

const REVISION_SYSTEM_PROMPT = `You are an AI assistant that updates 3D-printable part specifications based on user revision requests.

Given the original part specification (JSON) and a revision command from the user, produce an updated part specification.

Rules:
1. Only change what the user explicitly asked to change.
2. Keep all unchanged fields identical to the original.
3. Append a note to the assumptions array describing what changed.
4. Return ONLY valid JSON matching the original spec structure — no prose, no markdown.
5. The "family" field must remain one of the supported families unless the user explicitly requests a different family.`;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: ReviseBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { feedback, base_version, family } = body;
  if (!feedback?.trim()) {
    return NextResponse.json({ error: "feedback is required" }, { status: 400 });
  }

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id, status, user_id")
    .eq("id", jobId)
    .eq("user_id", user.id)
    .single();
  if (jobError || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const { data: baseSpec, error: specError } = await supabase
    .from("part_specs")
    .select("*")
    .eq("job_id", jobId)
    .eq("version", base_version)
    .single();
  if (specError || !baseSpec) {
    return NextResponse.json(
      { error: `Part spec version ${base_version} not found` },
      { status: 404 }
    );
  }

  const newVersion = base_version + 1;
  let updatedDimensions = baseSpec.dimensions_json;
  let updatedConstraints = baseSpec.constraints_json;
  let updatedMaterial = baseSpec.material;
  let updatedUnits = baseSpec.units;
  let updatedFamily = family ?? baseSpec.family;
  const updatedAssumptions: string[] = [...(baseSpec.assumptions_json ?? [])];

  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY ?? "placeholder",
    });
    const model = process.env.LLM_MODEL ?? "gpt-4.1-mini";
    const originalSpecSummary = JSON.stringify({
      family: baseSpec.family,
      dimensions: baseSpec.dimensions_json,
      constraints: baseSpec.constraints_json,
      material: baseSpec.material,
      units: baseSpec.units,
      assumptions: baseSpec.assumptions_json,
    }, null, 2);

    const completion = await openai.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: REVISION_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Original part spec:\n${originalSpecSummary}\n\nRevision request: "${feedback.trim()}"\n\nReturn the updated spec as JSON with keys: family, dimensions, constraints, material, units, assumptions (array of strings).`,
        },
      ],
      temperature: 0.2,
      max_tokens: 1024,
    });

    const raw = completion.choices[0].message.content ?? "{}";
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }

    if (parsed.dimensions && typeof parsed.dimensions === "object") updatedDimensions = parsed.dimensions;
    if (parsed.constraints && typeof parsed.constraints === "object") updatedConstraints = parsed.constraints;
    if (typeof parsed.material === "string") updatedMaterial = parsed.material;
    if (typeof parsed.units === "string") updatedUnits = parsed.units;
    if (typeof parsed.family === "string") updatedFamily = parsed.family;
    if (Array.isArray(parsed.assumptions)) {
      updatedAssumptions.splice(0, updatedAssumptions.length, ...(parsed.assumptions as string[]));
    } else {
      updatedAssumptions.push(`[Revision v${newVersion}] ${feedback.trim()}`);
    }
  } catch (llmErr) {
    console.warn("LLM revision call failed, falling back to manual note:", llmErr);
    updatedAssumptions.push(`[Revision v${newVersion}] ${feedback.trim()}`);
  }

  const { data: newSpec, error: insertError } = await supabase
    .from("part_specs")
    .insert({
      job_id: jobId,
      version: newVersion,
      family: updatedFamily,
      dimensions_json: updatedDimensions,
      constraints_json: updatedConstraints,
      material: updatedMaterial,
      units: updatedUnits,
      assumptions_json: updatedAssumptions,
      clarification_questions_json: [],
      confidence_score: null,
      status: "draft",
    })
    .select()
    .single();

  if (insertError || !newSpec) {
    console.error("Failed to create revision spec:", insertError);
    return NextResponse.json({ error: "Failed to create revision spec" }, { status: 500 });
  }

  await supabase
    .from("jobs")
    .update({
      status: "generating",
      latest_spec_version: newVersion,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  const { data: cadRun, error: runError } = await supabase
    .from("cad_runs")
    .insert({
      job_id: jobId,
      part_spec_id: newSpec.id,
      engine: "build123d",
      generator_name: updatedFamily,
      generator_version: "1.0.0",
      status: "queued",
      normalized_params_json: {},
      validation_report_json: {},
    })
    .select()
    .single();

  if (runError || !cadRun) {
    console.error("CAD run insert error:", runError);
    return NextResponse.json({ error: "Failed to create CAD run record" }, { status: 500 });
  }

  await supabase
    .from("jobs")
    .update({ latest_run_id: cadRun.id })
    .eq("id", jobId);

  let triggerRunId: string | null = null;
  if (!process.env.TRIGGER_SECRET_KEY) {
    console.warn("TRIGGER_SECRET_KEY not set — Trigger.dev dispatch skipped.");
  } else {
    try {
      const handle = await tasks.trigger("cad-generation-pipeline", {
        job_id: jobId,
        cad_run_id: cadRun.id,
        part_spec_id: newSpec.id,
        variant_type: "requested",
        engine: "build123d",
      });
      triggerRunId = handle.id;
    } catch (err) {
      console.error("Trigger.dev dispatch failed:", err);
      await supabase.from("jobs").update({ status: "failed" }).eq("id", jobId);
      await supabase
        .from("cad_runs")
        .update({
          status: "failed",
          error_text: `Trigger.dev dispatch failed: ${String(err)}`,
          ended_at: new Date().toISOString(),
        })
        .eq("id", cadRun.id);
      return NextResponse.json(
        { error: "Failed to dispatch background job. Please retry." },
        { status: 503 }
      );
    }
  }

  return NextResponse.json({ jobId, newVersion, spec_id: newSpec.id, cad_run_id: cadRun.id, trigger_run_id: triggerRunId });
}
