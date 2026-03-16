/**
 * POST /api/live-session
 *
 * Fix F (provider consistency): This route now supports two providers:
 *
 *   LLM_PROVIDER=gemini  → Gemini Live function-calling path (preferred)
 *   LLM_PROVIDER=openai  → Whisper + GPT-4.1 JSON path (fallback / default)
 *
 * Both paths share the same session/job/voice_turn persistence logic.
 * The provider is selected at runtime via the LLM_PROVIDER env var.
 *
 * Request body:
 *   session_id: string   — UUID from public.sessions (server-bootstrapped)
 *   job_id: string | null
 *   audio_base64: string  (base64-encoded audio)
 *   mime_type: string     (e.g. "audio/webm")
 *
 * Response:
 *   user_transcript: string
 *   assistant_response: string
 *   job_id: string | null
 *   part_spec: object | null
 *   needs_clarification: boolean
 *   clarification_questions: string[]
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import OpenAI from "openai";
import { geminiLiveTurn, isGeminiEnabled } from "./gemini-live";
import { ORCHESTRATION_SYSTEM_PROMPT } from "@ai4u/shared/src/prompts/system-prompt";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Compact voice-turn JSON wrapper for the OpenAI path
const OPENAI_VOICE_PROMPT = `${ORCHESTRATION_SYSTEM_PROMPT}

Respond ONLY in JSON:
{
  "response_text": "Your spoken response",
  "part_spec": null | { "family": "...", "units": "mm", "dimensions": {...}, "assumptions": [...], "missing_fields": [...] },
  "spec_complete": false,
  "clarification_questions": []
}`;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { session_id, job_id, audio_base64, mime_type } = body;

    if (!audio_base64 || !session_id) {
      return NextResponse.json(
        { error: "Missing required fields: session_id, audio_base64" },
        { status: 400 }
      );
    }

    // ── Verify session_id belongs to this user ───────────────
    const { data: sessionRow, error: sessionError } = await supabase
      .from("sessions")
      .select("id")
      .eq("id", session_id)
      .eq("user_id", user.id)
      .single();

    if (sessionError || !sessionRow) {
      return NextResponse.json(
        { error: "Invalid or unauthorized session_id" },
        { status: 403 }
      );
    }

    // ── Fetch conversation history ───────────────────────────
    let conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = [];
    if (job_id) {
      const { data: turns } = await supabase
        .from("voice_turns")
        .select("speaker, transcript_text")
        .eq("job_id", job_id)
        .order("created_at", { ascending: true })
        .limit(20);

      if (turns) {
        conversationHistory = turns.map((t) => ({
          role: t.speaker as "user" | "assistant",
          content: t.transcript_text,
        }));
      }
    }

    // ── Provider dispatch ────────────────────────────────────
    let userTranscript = "";
    let assistantResponse = "";
    let partSpec: Record<string, unknown> | null = null;
    let specComplete = false;
    let clarificationQuestions: string[] = [];

    if (isGeminiEnabled()) {
      // ── Gemini Live path ─────────────────────────────────
      // Step 1: Transcribe audio with Whisper (Gemini Live audio input
      // requires a persistent WebSocket session — V1 uses Whisper for
      // transcription and feeds text to Gemini for reasoning/function-calling)
      try {
        const audioBuffer = Buffer.from(audio_base64, "base64");
        const audioFile = new File([audioBuffer], "audio.webm", {
          type: mime_type ?? "audio/webm",
        });
        const transcription = await openai.audio.transcriptions.create({
          file: audioFile,
          model: "whisper-1",
          language: "en",
        });
        userTranscript = transcription.text;
      } catch (err) {
        console.error("Whisper transcription failed:", err);
        return NextResponse.json({ error: "Audio transcription failed" }, { status: 500 });
      }

      if (!userTranscript.trim()) {
        return NextResponse.json({
          user_transcript: "",
          assistant_response: "I didn't catch that. Could you repeat?",
          job_id: job_id ?? null,
          part_spec: null,
          needs_clarification: true,
          clarification_questions: [],
        });
      }

      // Step 2: Gemini function-calling for spec extraction
      const geminiResult = await geminiLiveTurn({
        audioBase64: audio_base64,
        mimeType: mime_type ?? "audio/webm",
        conversationHistory,
        userTranscript,
      });

      assistantResponse = geminiResult.response_text;
      partSpec = geminiResult.part_spec;
      specComplete = geminiResult.spec_complete;
      clarificationQuestions = geminiResult.clarification_questions;
    } else {
      // ── OpenAI / Whisper path (default) ─────────────────
      // Step 1: Transcribe
      try {
        const audioBuffer = Buffer.from(audio_base64, "base64");
        const audioFile = new File([audioBuffer], "audio.webm", {
          type: mime_type ?? "audio/webm",
        });
        const transcription = await openai.audio.transcriptions.create({
          file: audioFile,
          model: "whisper-1",
          language: "en",
        });
        userTranscript = transcription.text;
      } catch (err) {
        console.error("Whisper transcription failed:", err);
        return NextResponse.json({ error: "Audio transcription failed" }, { status: 500 });
      }

      if (!userTranscript.trim()) {
        return NextResponse.json({
          user_transcript: "",
          assistant_response: "I didn't catch that. Could you repeat?",
          job_id: job_id ?? null,
          part_spec: null,
          needs_clarification: true,
          clarification_questions: [],
        });
      }

      // Step 2: GPT-4.1 JSON completion
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: "system", content: OPENAI_VOICE_PROMPT },
        ...conversationHistory,
        { role: "user", content: userTranscript },
      ];

      const model = process.env.LLM_MODEL ?? "gpt-4.1-mini";
      const completion = await openai.chat.completions.create({
        model,
        messages,
        response_format: { type: "json_object" },
        temperature: 0.3,
        max_tokens: 800,
      });

      let parsed: {
        response_text: string;
        part_spec: Record<string, unknown> | null;
        spec_complete: boolean;
        clarification_questions: string[];
      };

      try {
        parsed = JSON.parse(completion.choices[0].message.content ?? "{}");
      } catch {
        parsed = {
          response_text:
            completion.choices[0].message.content ?? "I had trouble processing that.",
          part_spec: null,
          spec_complete: false,
          clarification_questions: [],
        };
      }

      assistantResponse = parsed.response_text;
      partSpec = parsed.part_spec;
      specComplete = parsed.spec_complete;
      clarificationQuestions = parsed.clarification_questions ?? [];
    }

    // ── Persist job and voice turns ──────────────────────────
    let currentJobId = job_id;

    if (!currentJobId) {
      const { data: newJob, error: jobError } = await supabase
        .from("jobs")
        .insert({
          user_id: user.id,
          session_id,
          title: userTranscript.slice(0, 100),
          status: "clarifying",
          latest_spec_version: 0,
        })
        .select()
        .single();

      if (jobError) {
        console.error("Failed to create job:", jobError);
      } else {
        currentJobId = newJob.id;
      }
    }

    if (currentJobId) {
      await supabase.from("voice_turns").insert([
        {
          session_id,
          job_id: currentJobId,
          speaker: "user",
          transcript_text: userTranscript,
        },
        {
          session_id,
          job_id: currentJobId,
          speaker: "assistant",
          transcript_text: assistantResponse,
        },
      ]);

      if (specComplete && partSpec) {
        const spec = partSpec as Record<string, unknown>;

        await supabase
          .from("part_specs")
          .insert({
            job_id: currentJobId,
            version: 1,
            units: spec.units ?? "mm",
            family: spec.family,
            material: spec.material ?? null,
            dimensions_json: spec.dimensions ?? {},
            load_requirements_json: spec.load_requirements ?? {},
            constraints_json: spec.constraints ?? {},
            printer_constraints_json: spec.printer_constraints ?? {},
            assumptions_json: spec.assumptions ?? [],
            missing_fields_json: spec.missing_fields ?? [],
            created_by: "ai",
          })
          .select()
          .single();

        await supabase
          .from("jobs")
          .update({
            status: "draft",
            requested_family: spec.family as string,
            selected_family: spec.family as string,
            latest_spec_version: 1,
          })
          .eq("id", currentJobId);
      }
    }

    return NextResponse.json({
      user_transcript: userTranscript,
      assistant_response: assistantResponse,
      job_id: currentJobId ?? null,
      part_spec: specComplete ? partSpec : null,
      needs_clarification: !specComplete,
      clarification_questions: clarificationQuestions,
    });
  } catch (err) {
    console.error("Live session error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
