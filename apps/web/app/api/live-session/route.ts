/**
 * POST /api/live-session
 * Processes a voice audio blob through Gemini Live API (or Whisper + GPT-4.1)
 * and returns structured transcript + assistant response.
 *
 * Request body:
 *   session_id: string
 *   job_id: string | null
 *   audio_base64: string  (base64-encoded audio)
 *   mime_type: string     (e.g. "audio/webm")
 *
 * Response:
 *   user_transcript: string
 *   assistant_response: string
 *   job_id: string | null  (created or existing)
 *   part_spec: object | null  (if spec is ready)
 *   needs_clarification: boolean
 *   clarification_questions: string[]
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// System prompt for the part extraction assistant
const SYSTEM_PROMPT = `You are AI4U Little Engineer, a voice-first assistant that helps machinists and makers design 3D-printable parts.

Your job:
1. Listen to the user's description of a part they need
2. Extract structured part specifications (family, dimensions, material, constraints)
3. Ask ONLY the most critical missing questions — one at a time
4. Confirm assumptions clearly before finalizing

Supported part families: spacer, flat_bracket, l_bracket, u_bracket, hole_plate, standoff_block, cable_clip, enclosure, adapter_bushing, simple_jig

Rules:
- Be concise and conversational — this is voice UI
- Always state your assumptions explicitly
- If units are not specified, ask (mm or inches?)
- Never invent dimensions — ask if unsure
- When spec is complete, say "I have everything I need. Generating your [part name] now."

Respond in JSON format:
{
  "response_text": "Your spoken response to the user",
  "part_spec": null or { "family": "...", "units": "mm", "dimensions": {...}, "assumptions": [...], "missing_fields": [...] },
  "spec_complete": false,
  "clarification_questions": ["question if needed"]
}`;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
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

    // Step 1: Transcribe audio using Whisper
    let userTranscript = "";
    try {
      // Convert base64 to buffer
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
      return NextResponse.json(
        { error: "Audio transcription failed" },
        { status: 500 }
      );
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

    // Step 2: Fetch conversation history for context
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

    // Step 3: Generate assistant response using GPT-4.1
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...conversationHistory,
      { role: "user", content: userTranscript },
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages,
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 800,
    });

    let assistantData: {
      response_text: string;
      part_spec: Record<string, unknown> | null;
      spec_complete: boolean;
      clarification_questions: string[];
    };

    try {
      assistantData = JSON.parse(
        completion.choices[0].message.content ?? "{}"
      );
    } catch {
      assistantData = {
        response_text: completion.choices[0].message.content ?? "I had trouble processing that.",
        part_spec: null,
        spec_complete: false,
        clarification_questions: [],
      };
    }

    // Step 4: Create or update job in database
    let currentJobId = job_id;

    if (!currentJobId) {
      // Create a new job
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

    // Step 5: Save voice turns
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
          transcript_text: assistantData.response_text,
        },
      ]);

      // Step 6: If spec is complete, save it
      if (assistantData.spec_complete && assistantData.part_spec) {
        const spec = assistantData.part_spec as Record<string, unknown>;

        const { data: savedSpec } = await supabase
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

        // Update job status
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
      assistant_response: assistantData.response_text,
      job_id: currentJobId ?? null,
      part_spec: assistantData.spec_complete ? assistantData.part_spec : null,
      needs_clarification: !assistantData.spec_complete,
      clarification_questions: assistantData.clarification_questions ?? [],
    });
  } catch (err) {
    console.error("Live session error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
