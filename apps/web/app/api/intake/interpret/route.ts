/**
 * POST /api/intake/interpret
 *
 * Multimodal interpretation engine.
 * Accepts text + optional uploaded files (images/documents) and returns
 * a structured InterpretationResult that classifies the request into a
 * creation mode and extracts as much information as possible.
 *
 * Session storage strategy (dual-layer):
 * 1. Primary: Supabase intake_sessions table (if it exists)
 * 2. Fallback: In-memory Map via lib/intake-session-store
 *
 * The session_id is ALWAYS returned in the response so ClarificationChat
 * can pass it to /api/intake/clarify.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import OpenAI from "openai";
import { getAuthUser } from "@/lib/auth";
import { randomUUID } from "crypto";
import { setIntakeSession } from "@/lib/intake-session-store";

// Supported interpretation modes
const INTERPRETATION_MODES = [
  "parametric_part",
  "image_to_relief",
  "image_to_replica",
  "svg_to_extrusion",
  "document_to_model_reference",
  "concept_invention",
  "needs_clarification",
] as const;

type InterpretationMode = (typeof INTERPRETATION_MODES)[number];

export interface InterpretationResult {
  mode: InterpretationMode;
  family_candidate: string | null;
  extracted_dimensions: Record<string, number>;
  inferred_scale: string | null;
  inferred_object_type: string | null;
  missing_information: string[];
  assistant_message: string;
  preview_strategy: string | null;
  confidence: number;
  file_interpretations: FileInterpretation[];
  session_id: string;
}

interface FileInterpretation {
  file_name: string;
  file_category: "image" | "document" | "svg" | "unknown";
  interpretation: string;
  analysis_notes: string;
}

interface RequestBody {
  text: string;
  files?: Array<{
    id: string;
    name: string;
    type: string;
    size: number;
    dataUrl: string;
  }>;
  voice_transcript?: string;
  session_id?: string;
  conversation_history?: Array<{ role: "user" | "assistant"; content: string }>;
}

const SYSTEM_PROMPT = `You are the AI4U Little Engineer interpretation engine.
Your job is to understand what a user wants to 3D print — even if they are not technical.
You accept text descriptions, uploaded images, and documents.

You must return a JSON object with these fields:
{
  "mode": one of [${INTERPRETATION_MODES.map((m) => `"${m}"`).join(", ")}],
  "family_candidate": string or null (one of: spacer, bracket, enclosure, cable_clip, fan_mount, pcb_jig, wall_mount, hinge, knob, custom_shape),
  "extracted_dimensions": object with numeric values in mm (e.g. {"length": 50, "width": 30}),
  "inferred_scale": string or null (e.g. "palm-sized", "desk ornament", "full display model"),
  "inferred_object_type": string or null (e.g. "rocket model", "wall sign", "cable holder"),
  "missing_information": array of strings — only list what is TRULY missing and needed,
  "assistant_message": a friendly, non-technical message to the user (1-3 sentences),
  "preview_strategy": string or null (e.g. "flat_relief", "parametric_render", "concept_sketch"),
  "confidence": number 0.0-1.0
}

Rules:
- NEVER hallucinate certainty. If you don't know a dimension, list it in missing_information.
- Keep assistant_message friendly and jargon-free unless the user used jargon.
- If the user uploaded an image, describe what you see and how it maps to a printable form.
- If mode is "needs_clarification", ask for ONLY the single most important missing piece.
- Do NOT claim arbitrary single-image 3D reconstruction is solved. Be honest about limitations.`;

export async function POST(req: NextRequest) {
  try {
    const openai = new OpenAI();
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: RequestBody = await req.json();
    const { text, files = [], voice_transcript, session_id, conversation_history = [] } = body;

    if (!text && files.length === 0 && !voice_transcript) {
      return NextResponse.json({ error: "No input provided" }, { status: 400 });
    }

    const serviceSupabase = createServiceClient();

    // Build the messages array for the LLM
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM_PROMPT },
    ];

    // Add conversation history (last 6 turns)
    for (const msg of conversation_history.slice(-6)) {
      messages.push({ role: msg.role, content: msg.content });
    }

    // Build the user message content (multimodal)
    const userContent: OpenAI.Chat.ChatCompletionContentPart[] = [];

    const combinedText = [
      text,
      voice_transcript ? `[Voice transcript: ${voice_transcript}]` : null,
    ]
      .filter(Boolean)
      .join("\n\n");

    if (combinedText) {
      userContent.push({ type: "text", text: combinedText });
    }

    const imageFiles = files.filter(
      (f) =>
        f.type.startsWith("image/") &&
        f.type !== "image/svg+xml" &&
        f.dataUrl.startsWith("data:")
    );
    for (const img of imageFiles.slice(0, 3)) {
      userContent.push({
        type: "image_url",
        image_url: { url: img.dataUrl, detail: "low" },
      });
    }

    const docFiles = files.filter(
      (f) => !f.type.startsWith("image/") || f.type === "image/svg+xml"
    );
    if (docFiles.length > 0) {
      userContent.push({
        type: "text",
        text: `Uploaded documents: ${docFiles.map((f) => `${f.name} (${f.type})`).join(", ")}. Treat these as reference material.`,
      });
    }

    if (userContent.length === 0) {
      userContent.push({ type: "text", text: "(empty request)" });
    }

    messages.push({ role: "user", content: userContent });

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages,
      temperature: 0.1,
      max_tokens: 600,
      response_format: { type: "json_object" },
    });

    let parsed: Partial<InterpretationResult> = {};
    try {
      parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
    } catch {
      parsed = {
        mode: "needs_clarification",
        assistant_message: "I had trouble understanding that. Could you describe what you want to print in a sentence or two?",
        confidence: 0,
      };
    }

    if (!INTERPRETATION_MODES.includes(parsed.mode as InterpretationMode)) {
      parsed.mode = "needs_clarification";
    }

    const fileInterpretations: FileInterpretation[] = files.map((f) => {
      const isImage = f.type.startsWith("image/") && f.type !== "image/svg+xml";
      const isSvg = f.type === "image/svg+xml";
      const isDoc = !isImage && !isSvg;
      return {
        file_name: f.name,
        file_category: isImage ? "image" : isSvg ? "svg" : isDoc ? "document" : "unknown",
        interpretation: isImage
          ? (parsed.mode === "image_to_relief" ? "flat_relief" : "reference_image")
          : isSvg
          ? "svg_extrusion_candidate"
          : "reference_document",
        analysis_notes: `Received ${f.name} (${(f.size / 1024).toFixed(1)}KB)`,
      };
    });

    // ── Session state to persist ──────────────────────────────────────────────
    const sessionData = {
      clerk_user_id: user.id,
      mode: parsed.mode,
      family_candidate: parsed.family_candidate ?? null,
      extracted_dimensions: parsed.extracted_dimensions ?? {},
      inferred_scale: parsed.inferred_scale ?? null,
      inferred_object_type: parsed.inferred_object_type ?? null,
      missing_information: parsed.missing_information ?? [],
      assistant_message: parsed.assistant_message ?? "",
      preview_strategy: parsed.preview_strategy ?? null,
      confidence: parsed.confidence ?? 0,
      conversation_history: [
        ...conversation_history,
        { role: "user", content: combinedText || "(file upload)" },
        { role: "assistant", content: parsed.assistant_message ?? "" },
      ],
      status: "active",
    };

    // ── Dual-layer session storage ────────────────────────────────────────────
    // Generate a session ID upfront so we always have one to return
    const newSessionId = randomUUID();
    let activeSessionId = session_id ?? newSessionId;

    // 1. Try Supabase (primary)
    let dbSuccess = false;
    try {
      if (!session_id) {
        const { data: newSession, error } = await serviceSupabase
          .from("intake_sessions")
          .insert({ ...sessionData, id: activeSessionId })
          .select("id")
          .single();
        if (!error && newSession?.id) {
          activeSessionId = newSession.id;
          dbSuccess = true;
        }
      } else {
        const { error } = await serviceSupabase
          .from("intake_sessions")
          .update({
            ...sessionData,
            updated_at: new Date().toISOString(),
          })
          .eq("id", session_id);
        if (!error) {
          dbSuccess = true;
        }
      }
    } catch (dbErr) {
      console.warn("[/api/intake/interpret] DB session storage failed, using in-memory fallback:", dbErr);
    }

    // 2. Always write to in-memory store as well (ensures clarify can find it)
    setIntakeSession(activeSessionId, { ...sessionData, id: activeSessionId });

    if (!dbSuccess) {
      console.info(`[/api/intake/interpret] Session ${activeSessionId} stored in-memory only`);
    }

    const result: InterpretationResult = {
      mode: (parsed.mode as InterpretationMode) ?? "needs_clarification",
      family_candidate: parsed.family_candidate ?? null,
      extracted_dimensions: parsed.extracted_dimensions ?? {},
      inferred_scale: parsed.inferred_scale ?? null,
      inferred_object_type: parsed.inferred_object_type ?? null,
      missing_information: parsed.missing_information ?? [],
      assistant_message: parsed.assistant_message ?? "Tell me more about what you want to create.",
      preview_strategy: parsed.preview_strategy ?? null,
      confidence: parsed.confidence ?? 0,
      file_interpretations: fileInterpretations,
      session_id: activeSessionId,
    };

    return NextResponse.json(result);
  } catch (err) {
    console.error("[/api/intake/interpret]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
