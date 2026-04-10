/**
 * POST /api/intake/interpret
 *
 * Multimodal interpretation engine.
 * Accepts text + optional uploaded files (images/documents) and returns
 * a structured InterpretationResult that classifies the request into a
 * creation mode and extracts as much information as possible.
 *
 * This is the core of the Universal Input Composer pipeline.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import OpenAI from "openai";


// Supported interpretation modes
const INTERPRETATION_MODES = [
  "parametric_part",          // engineering-style part with dimensions
  "image_to_relief",          // flat relief/plaque from image
  "image_to_replica",         // simplified 3D replica inspired by image
  "svg_to_extrusion",         // SVG path extruded into 3D
  "document_to_model_reference", // document used as reference for a part
  "concept_invention",        // free-form concept without clear dimensions
  "needs_clarification",      // not enough information to proceed
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
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
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

    // Add text
    const combinedText = [
      text,
      voice_transcript ? `[Voice transcript: ${voice_transcript}]` : null,
    ]
      .filter(Boolean)
      .join("\n\n");

    if (combinedText) {
      userContent.push({ type: "text", text: combinedText });
    }

    // Add images (only actual image types go to vision)
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

    // Add document/SVG descriptions as text
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

    // Choose model based on whether we have images
    const model = imageFiles.length > 0 ? "gpt-4.1-mini" : "gpt-4.1-mini";

    const completion = await openai.chat.completions.create({
      model,
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

    // Validate mode
    if (!INTERPRETATION_MODES.includes(parsed.mode as InterpretationMode)) {
      parsed.mode = "needs_clarification";
    }

    // Build file interpretations
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

    // Upsert intake session
    let activeSessionId = session_id;
    if (!activeSessionId) {
      const { data: newSession } = await serviceSupabase
        .from("intake_sessions")
        .insert({
          user_id: user.id,
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
        })
        .select("id")
        .single();
      activeSessionId = newSession?.id;
    } else {
      await serviceSupabase
        .from("intake_sessions")
        .update({
          mode: parsed.mode,
          family_candidate: parsed.family_candidate ?? null,
          extracted_dimensions: parsed.extracted_dimensions ?? {},
          inferred_scale: parsed.inferred_scale ?? null,
          inferred_object_type: parsed.inferred_object_type ?? null,
          missing_information: parsed.missing_information ?? [],
          assistant_message: parsed.assistant_message ?? "",
          preview_strategy: parsed.preview_strategy ?? null,
          confidence: parsed.confidence ?? 0,
          updated_at: new Date().toISOString(),
          conversation_history: [
            ...conversation_history,
            { role: "user", content: combinedText || "(file upload)" },
            { role: "assistant", content: parsed.assistant_message ?? "" },
          ],
        })
        .eq("id", activeSessionId);
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
      session_id: activeSessionId ?? "",
    };

    return NextResponse.json(result);
  } catch (err) {
    console.error("[/api/intake/interpret]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
