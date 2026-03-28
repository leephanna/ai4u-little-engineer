/**
 * POST /api/mobile/interpret-voice
 *
 * Accepts either:
 *   - { transcript: string, current_spec?, conversation_history? }
 *   - { audio_base64: string, current_spec?, conversation_history? }
 *
 * If audio_base64 is provided, it is transcribed via OpenAI Whisper first.
 * The transcript is then interpreted by GPT-4.1-mini to extract part intent,
 * family, dimensions, missing fields, and a natural-language response.
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

const SYSTEM_PROMPT = `You are an expert engineering assistant for AI4U Little Engineer, a voice-first CAD design app.

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

export async function POST(request: NextRequest) {
  try {
    // Auth check
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
    let transcript: string = body.transcript || "";

    // If audio_base64 is provided, transcribe via Whisper
    if (body.audio_base64 && !transcript) {
      try {
        // Decode base64 to buffer
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

    // Build conversation context
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM_PROMPT },
    ];

    // Add conversation history for context
    if (body.conversation_history?.length) {
      for (const msg of body.conversation_history.slice(-6)) {
        messages.push({
          role: msg.role as "user" | "assistant",
          content: msg.text,
        });
      }
    }

    // Add current spec context if available
    if (body.current_spec?.family) {
      messages.push({
        role: "system",
        content: `Current partial spec: ${JSON.stringify(body.current_spec)}`,
      });
    }

    messages.push({ role: "user", content: transcript });

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

    // Validate family is in supported list
    if (result.family && !MVP_PART_FAMILIES.includes(result.family as never)) {
      result.family = null;
      result.warnings = [
        ...(result.warnings as string[] || []),
        `Part family "${result.family}" is not supported in v1.`,
      ];
    }

    // Compute missing fields server-side for reliability
    if (result.family) {
      const required = REQUIRED_DIMENSIONS[result.family as keyof typeof REQUIRED_DIMENSIONS] ?? [];
      const dims = (result.dimensions as Record<string, number>) || {};
      result.missing_fields = required.filter(
        (f) => dims[f] === undefined || dims[f] === null || isNaN(dims[f])
      );
    }

    return NextResponse.json({ ...result, transcript });
  } catch (err: unknown) {
    console.error("[/api/mobile/interpret-voice]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
