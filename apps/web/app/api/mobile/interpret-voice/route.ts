/**
 * POST /api/mobile/interpret-voice
 *
 * Accepts either:
 *   - { transcript: string, current_spec?, conversation_history?, job_id? }
 *   - { audio_base64: string, current_spec?, conversation_history?, job_id? }
 *
 * Intelligence Layer (v2):
 *   - Reads the active NLU prompt from prompt_versions (status='production')
 *   - Reads dimension requirements from capability_registry (not hardcoded)
 *   - Writes a decision_ledger row (step='interpret') — fire-and-forget
 *
 * Auth: Bearer token (mobile app sends Supabase JWT).
 */
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import {
  MVP_PART_FAMILIES,
  REQUIRED_DIMENSIONS,
  PART_FAMILY_LABELS,
} from "@ai4u/shared";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Fallback system prompt (used if DB lookup fails)
const FALLBACK_SYSTEM_PROMPT = `You are an expert engineering assistant for AI4U Little Engineer, a voice-first CAD design app.
Your job is to interpret natural language requests from machinists and engineers and extract structured part specifications.
SUPPORTED PART FAMILIES (ONLY these — never suggest others):
${MVP_PART_FAMILIES.map((f) => `- ${f}: ${PART_FAMILY_LABELS[f as keyof typeof PART_FAMILY_LABELS]} (requires: ${REQUIRED_DIMENSIONS[f as keyof typeof REQUIRED_DIMENSIONS].join(", ")})`).join("\n")}
RULES:
1. Extract the part family from the user's request. Map common terms (e.g., "bushing" → adapter_bushing, "box" → enclosure, "clip" → cable_clip).
2. Extract all dimension values mentioned. Convert units if needed (inches to mm if user says "in millimeters").
3. Identify which required dimensions are still missing.
4. Generate a natural, conversational next_question for the FIRST missing field only.
5. If all fields are present, generate a summary_text like "Spacer, 20mm outer diameter, 10mm inner diameter, 5mm height."
6. Set intent to one of: create_part, edit_dimension, confirm, cancel, repeat, unknown.
7. Detect "confirm", "yes", "looks good", "generate it" → intent: confirm.
8. Detect "cancel", "start over", "never mind" → intent: cancel.
9. Detect "repeat", "say that again" → intent: repeat.
10. NEVER hallucinate unsupported geometry or part families.
11. Units default to mm unless user specifies inches.
Respond ONLY with valid JSON matching this schema:
{
  "intent": "create_part" | "edit_dimension" | "confirm" | "cancel" | "repeat" | "unknown",
  "family": string | null,
  "dimensions": { [key: string]: number },
  "missing_fields": string[],
  "units": "mm" | "in",
  "summary_text": string,
  "next_question": string | null,
  "confidence": number (0-1),
  "warnings": string[]
}`;

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
    // Non-blocking — never propagate
  }
}

export async function POST(request: NextRequest) {
  const startMs = Date.now();
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
    const jobId: string | null = body.job_id ?? null;
    let transcript: string = body.transcript || "";

    // ── Whisper transcription ─────────────────────────────────
    if (body.audio_base64 && !transcript) {
      try {
        const base64Data = body.audio_base64.replace(/^data:[^;]+;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");
        const blob = new Blob([buffer], { type: "audio/m4a" });
        const file = new File([blob], "recording.m4a", { type: "audio/m4a" });
        const transcription = await openai.audio.transcriptions.create({
          file,
          model: "whisper-1",
          language: "en",
        });
        transcript = transcription.text;
      } catch (whisperErr) {
        console.error("Whisper transcription failed:", whisperErr);
        return NextResponse.json(
          { error: "Audio transcription failed. Please try speaking again." },
          { status: 422 }
        );
      }
    }

    if (!transcript.trim()) {
      return NextResponse.json(
        { error: "No transcript or audio provided." },
        { status: 400 }
      );
    }

    // ── Load active NLU prompt from DB (with fallback) ────────
    let systemPrompt = FALLBACK_SYSTEM_PROMPT;
    let promptVersion = "v1.0-fallback";
    try {
      const svc = getServiceClient();
      const { data: promptRow } = await svc
        .from("prompt_versions")
        .select("prompt_text, version")
        .eq("name", "interpret_voice_nlu")
        .eq("status", "production")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (promptRow?.prompt_text) {
        systemPrompt = promptRow.prompt_text;
        promptVersion = promptRow.version;
      }
    } catch {
      // Use fallback — non-blocking
    }

    // ── Load dimension requirements from capability_registry ──
    let capabilityMap: Record<string, string[]> = {};
    try {
      const svc = getServiceClient();
      const { data: caps } = await svc
        .from("capability_registry")
        .select("family, required_dimensions")
        .eq("maturity_level", "proven");
      if (caps && caps.length > 0) {
        for (const cap of caps) {
          capabilityMap[cap.family] = cap.required_dimensions as string[];
        }
      }
    } catch {
      // Fall back to static REQUIRED_DIMENSIONS
    }
    // Merge with static fallback for any missing families
    for (const [fam, dims] of Object.entries(REQUIRED_DIMENSIONS)) {
      if (!capabilityMap[fam]) {
        capabilityMap[fam] = dims as string[];
      }
    }

    // ── Build conversation messages ───────────────────────────
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
    ];
    if (body.conversation_history?.length) {
      for (const msg of body.conversation_history.slice(-6)) {
        messages.push({
          role: msg.role as "user" | "assistant",
          content: msg.text,
        });
      }
    }
    if (body.current_spec?.family) {
      messages.push({
        role: "system",
        content: `Current partial spec: ${JSON.stringify(body.current_spec)}`,
      });
    }
    messages.push({ role: "user", content: transcript });

    // ── LLM call ──────────────────────────────────────────────
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages,
      temperature: 0.1,
      max_tokens: 512,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let result: Record<string, unknown>;
    try {
      result = JSON.parse(raw);
    } catch {
      result = {
        intent: "unknown",
        family: null,
        dimensions: {},
        missing_fields: [],
        units: "mm",
        summary_text: "I couldn't understand that. Could you try again?",
        next_question: "What part do you need?",
        confidence: 0,
        warnings: [],
      };
    }

    // ── Validate family ───────────────────────────────────────
    if (result.family && !MVP_PART_FAMILIES.includes(result.family as never)) {
      result.family = null;
      result.warnings = [
        ...(result.warnings as string[] || []),
        `Part family "${result.family}" is not supported in v1.`,
      ];
    }

    // ── Compute missing fields from capability_registry ───────
    if (result.family) {
      const required = capabilityMap[result.family as string] ?? [];
      const dims = (result.dimensions as Record<string, number>) || {};
      result.missing_fields = required.filter(
        (f) => dims[f] === undefined || dims[f] === null || isNaN(dims[f])
      );
    }

    const durationMs = Date.now() - startMs;

    // ── Decision ledger write (fire-and-forget) ───────────────
    void writeDecisionLedger(
      jobId,
      "interpret",
      {
        transcript,
        conversation_history_length: body.conversation_history?.length ?? 0,
        current_spec_family: body.current_spec?.family ?? null,
        prompt_version: promptVersion,
      },
      {
        intent: result.intent,
        family: result.family,
        dimensions: result.dimensions,
        missing_fields: result.missing_fields,
        confidence: result.confidence,
        duration_ms: durationMs,
      },
      `NLU interpret via prompt ${promptVersion}, intent=${result.intent}, confidence=${result.confidence}`
    );

    return NextResponse.json({ ...result, transcript, prompt_version: promptVersion });
  } catch (err: unknown) {
    console.error("[/api/mobile/interpret-voice]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
