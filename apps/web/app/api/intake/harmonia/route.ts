/**
 * POST /api/intake/harmonia
 *
 * Harmonia Multiple-Input Protocol — Unified Merge Engine
 *
 * Merges all input modalities into a single unified interpretation:
 *   - text description
 *   - voice transcript
 *   - uploaded images (base64 data URLs)
 *   - uploaded documents (text content)
 *   - uploaded SVGs
 *   - prior intake session state
 *
 * Output contract:
 *   - one unified_request: string (the merged, canonical description)
 *   - one confidence: number (0–1)
 *   - one missing_information: string[] (deduplicated, non-redundant)
 *   - one recommended_path: "parametric" | "concept" | "image_relief" | "needs_clarification"
 *   - one mode: InterpretationMode
 *   - one family_candidate: string | null
 *   - one extracted_dimensions: Record<string, number>
 *   - one assistant_message: string (friendly, jargon-free)
 *   - one daedalus_receipt: DaedalusReceipt
 *
 * Key rule: Do NOT ask redundant follow-up questions if another input already
 * answered them. The merge step resolves conflicts before returning.
 *
 * Daedalus Gate Receipt: included in response as `daedalus_receipt`.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import OpenAI from "openai";
import { getAuthUser } from "@/lib/auth";


// ── Types ─────────────────────────────────────────────────────────────────────
type InterpretationMode =
  | "parametric_part"
  | "image_to_relief"
  | "image_to_replica"
  | "svg_to_extrusion"
  | "document_to_model_reference"
  | "concept_invention"
  | "needs_clarification";

type RecommendedPath =
  | "parametric"
  | "concept"
  | "image_relief"
  | "needs_clarification";

interface InputFile {
  id: string;
  name: string;
  type: string;
  size: number;
  dataUrl: string;
}

interface PriorSessionState {
  session_id?: string;
  mode?: string;
  family_candidate?: string | null;
  extracted_dimensions?: Record<string, number>;
  missing_information?: string[];
  conversation_history?: Array<{ role: "user" | "assistant"; content: string }>;
}

interface RequestBody {
  text?: string;
  voice_transcript?: string;
  files?: InputFile[];
  prior_session?: PriorSessionState;
  user_context?: string; // e.g. "machinist" | "hobbyist" | "unknown"
}

interface HarmoniaResult {
  unified_request: string;
  confidence: number;
  missing_information: string[];
  recommended_path: RecommendedPath;
  mode: InterpretationMode;
  family_candidate: string | null;
  extracted_dimensions: Record<string, number>;
  assistant_message: string;
  input_summary: {
    has_text: boolean;
    has_voice: boolean;
    has_images: boolean;
    has_documents: boolean;
    has_svg: boolean;
    has_prior_session: boolean;
    total_inputs: number;
  };
  daedalus_receipt: DaedalusReceipt;
  session_id: string;
}

interface DaedalusReceipt {
  gate: "harmonia_merge";
  timestamp: string;
  elapsed_ms: number;
  inputs_received: string[];
  merge_strategy: string;
  confidence: number;
  recommended_path: RecommendedPath;
  result: "GO" | "CLARIFY" | "REJECT";
  notes: string[];
}

// ── System prompt ─────────────────────────────────────────────────────────────
const HARMONIA_SYSTEM_PROMPT = `You are the AI4U Harmonia Merge Engine.

Your job is to merge multiple input modalities into ONE unified 3D print request.

You receive:
- text: user's typed description (may be empty)
- voice_transcript: what the user said aloud (may be empty or same as text)
- file_summaries: descriptions of uploaded files (images, SVGs, documents)
- prior_session: previous interpretation state (may be null)
- user_context: "machinist", "hobbyist", or "unknown"

MERGE RULES:
1. Combine all inputs into one unified_request string
2. If voice and text say the same thing, use text (it's more precise)
3. If an image shows dimensions, extract them — do NOT ask for them again
4. If a document contains specs, use them — do NOT ask for them again
5. If prior_session already answered a question, do NOT ask it again
6. Resolve conflicts: prefer explicit dimensions over inferred ones
7. The unified_request must be a single, clear, actionable description

INTERPRETATION MODES:
- parametric_part: mechanical part with dimensions (spacer, bracket, jig, bushing, clip, enclosure, mount, knob)
- image_to_relief: image → flat relief/plaque
- image_to_replica: image → 3D replica/model
- svg_to_extrusion: SVG → extruded 3D shape
- document_to_model_reference: document → use as reference for parametric part
- concept_invention: open-ended creative/showcase print (toy, collectible, ornament, rocket, catapult)
- needs_clarification: not enough information to proceed

RECOMMENDED PATHS:
- parametric: use /api/invent (mechanical families: spacer, bracket, jig, bushing, cable_clip, enclosure, standoff, adapter)
- concept: use /api/intake/interpret with mode=concept_invention
- image_relief: use /api/intake/interpret with mode=image_to_relief or image_to_replica
- needs_clarification: ask follow-up questions

PART FAMILIES (for parametric path):
spacer, flat_bracket, l_bracket, u_bracket, hole_plate, standoff_block, cable_clip, enclosure, adapter_bushing, simple_jig

DIMENSION EXTRACTION:
Extract any numeric dimensions mentioned in any input. Return as object with mm values.
Examples: {"outer_diameter": 20, "inner_diameter": 5, "length": 30}

MISSING INFORMATION:
Only list what is TRULY missing and needed for generation.
Do NOT list something that was already answered by another input.
Keep list short — max 3 items.

ASSISTANT MESSAGE:
Write a friendly, non-technical 1-3 sentence message for the user.
Do NOT use jargon. Be encouraging.

RESPONSE FORMAT (strict JSON, no markdown):
{
  "unified_request": "string",
  "confidence": 0.0_to_1.0,
  "missing_information": ["string"],
  "recommended_path": "parametric|concept|image_relief|needs_clarification",
  "mode": "one_of_the_modes",
  "family_candidate": "family_name_or_null",
  "extracted_dimensions": {},
  "assistant_message": "string"
}`;

// ── File classifier ───────────────────────────────────────────────────────────
function classifyFile(file: InputFile): { category: string; summary: string } {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();

  if (type.startsWith("image/") || /\.(png|jpg|jpeg|gif|webp|bmp)$/.test(name)) {
    return { category: "image", summary: `Image file: ${file.name}` };
  }
  if (type === "image/svg+xml" || name.endsWith(".svg")) {
    return { category: "svg", summary: `SVG vector file: ${file.name}` };
  }
  if (
    type === "application/pdf" ||
    type.includes("word") ||
    /\.(pdf|doc|docx|txt|md)$/.test(name)
  ) {
    return { category: "document", summary: `Document file: ${file.name}` };
  }
  return { category: "unknown", summary: `File: ${file.name} (${file.type})` };
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const startMs = Date.now();

  try {
    const openai = new OpenAI();
    const body: RequestBody = await req.json();
    const {
      text = "",
      voice_transcript = "",
      files = [],
      prior_session,
      user_context = "unknown",
    } = body;

    // ── Auth ────────────────────────────────────────────────────
    const supabase = await createClient();
        const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const serviceSupabase = createServiceClient();

    // ── Classify files ──────────────────────────────────────────
    const fileClassifications = files.map(classifyFile);
    const hasImages = fileClassifications.some((f) => f.category === "image");
    const hasDocuments = fileClassifications.some((f) => f.category === "document");
    const hasSvg = fileClassifications.some((f) => f.category === "svg");
    const hasText = text.trim().length > 0;
    const hasVoice = voice_transcript.trim().length > 0;
    const hasPriorSession = !!prior_session?.session_id;

    const inputSummary = {
      has_text: hasText,
      has_voice: hasVoice,
      has_images: hasImages,
      has_documents: hasDocuments,
      has_svg: hasSvg,
      has_prior_session: hasPriorSession,
      total_inputs: [hasText, hasVoice, hasImages, hasDocuments, hasSvg].filter(Boolean).length,
    };

    // ── Build merge context for LLM ─────────────────────────────
    const mergeContext: Record<string, unknown> = {};

    if (hasText) mergeContext.text = text;
    if (hasVoice && voice_transcript !== text) mergeContext.voice_transcript = voice_transcript;
    if (files.length > 0) {
      mergeContext.file_summaries = fileClassifications.map((f) => f.summary);
    }
    if (prior_session) {
      mergeContext.prior_session = {
        mode: prior_session.mode,
        family_candidate: prior_session.family_candidate,
        extracted_dimensions: prior_session.extracted_dimensions,
        previously_missing: prior_session.missing_information,
      };
    }
    mergeContext.user_context = user_context;

    // ── Handle image inputs with vision ────────────────────────
    const imageFiles = files.filter((f) => {
      const cat = classifyFile(f).category;
      return cat === "image";
    });

    let llmResult: HarmoniaResult["mode"] extends string ? {
      unified_request: string;
      confidence: number;
      missing_information: string[];
      recommended_path: RecommendedPath;
      mode: InterpretationMode;
      family_candidate: string | null;
      extracted_dimensions: Record<string, number>;
      assistant_message: string;
    } : never;

    if (imageFiles.length > 0) {
      // Use vision model for image inputs
      const imageContent: OpenAI.Chat.ChatCompletionContentPart[] = imageFiles
        .slice(0, 3) // max 3 images
        .map((f) => ({
          type: "image_url" as const,
          image_url: { url: f.dataUrl, detail: "low" as const },
        }));

      const response = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: HARMONIA_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Merge these inputs into one unified 3D print request:\n${JSON.stringify(mergeContext, null, 2)}`,
              },
              ...imageContent,
            ],
          },
        ],
        response_format: { type: "json_object" },
        max_tokens: 800,
        temperature: 0.2,
      });
      llmResult = JSON.parse(response.choices[0].message.content ?? "{}");
    } else {
      // Text-only merge
      const response = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: HARMONIA_SYSTEM_PROMPT },
          {
            role: "user",
            content: `Merge these inputs into one unified 3D print request:\n${JSON.stringify(mergeContext, null, 2)}`,
          },
        ],
        response_format: { type: "json_object" },
        max_tokens: 600,
        temperature: 0.2,
      });
      llmResult = JSON.parse(response.choices[0].message.content ?? "{}");
    }

    // ── Create/update intake session ────────────────────────────
    let sessionId: string = prior_session?.session_id ?? "";
    if (!sessionId) {
      const { data: session } = await serviceSupabase
        .from("intake_sessions")
        .insert({
          clerk_user_id: user.id,
          raw_text: text || voice_transcript,
          voice_transcript: voice_transcript || null,
          mode: llmResult.mode,
          confidence: llmResult.confidence,
          extracted_dimensions: llmResult.extracted_dimensions,
          missing_information: llmResult.missing_information,
          assistant_message: llmResult.assistant_message,
          file_count: files.length,
        })
        .select("id")
        .single();
      sessionId = session?.id ?? `harmonia-${Date.now()}`;
    } else {
      // Update existing session with merged result
      await serviceSupabase
        .from("intake_sessions")
        .update({
          mode: llmResult.mode,
          confidence: llmResult.confidence,
          extracted_dimensions: llmResult.extracted_dimensions,
          missing_information: llmResult.missing_information,
          assistant_message: llmResult.assistant_message,
        })
        .eq("id", sessionId);
    }

    // ── Build Daedalus Gate Receipt ─────────────────────────────
    const elapsedMs = Date.now() - startMs;
    const inputsReceived: string[] = [];
    if (hasText) inputsReceived.push("text");
    if (hasVoice) inputsReceived.push("voice");
    if (hasImages) inputsReceived.push(`images(${imageFiles.length})`);
    if (hasDocuments) inputsReceived.push("documents");
    if (hasSvg) inputsReceived.push("svg");
    if (hasPriorSession) inputsReceived.push("prior_session");

    const daedalusReceipt: DaedalusReceipt = {
      gate: "harmonia_merge",
      timestamp: new Date().toISOString(),
      elapsed_ms: elapsedMs,
      inputs_received: inputsReceived,
      merge_strategy: imageFiles.length > 0 ? "vision_assisted_merge" : "text_merge",
      confidence: llmResult.confidence,
      recommended_path: llmResult.recommended_path,
      result:
        llmResult.recommended_path === "needs_clarification"
          ? "CLARIFY"
          : llmResult.confidence >= 0.65
          ? "GO"
          : "CLARIFY",
      notes: [
        `${inputSummary.total_inputs} input modalities merged`,
        `${llmResult.missing_information.length} missing fields after merge`,
        prior_session ? "Prior session state incorporated" : "New session",
      ],
    };

    const result: HarmoniaResult = {
      ...llmResult,
      input_summary: inputSummary,
      daedalus_receipt: daedalusReceipt,
      session_id: sessionId,
    };

    return NextResponse.json(result);
  } catch (err) {
    console.error("Harmonia merge error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
