/**
 * POST /api/intake/interpret
 *
 * Multimodal interpretation engine.
 * Accepts:
 *   - application/json: { text, files?, voice_transcript?, session_id?, conversation_history? }
 *   - multipart/form-data: text (field), file (File, optional)
 *
 * Returns a structured InterpretationResult including a session_id that
 * ClarificationChat uses to call /api/intake/clarify.
 *
 * Session storage strategy (DB-primary, memory-fallback):
 * 1. PRIMARY: Supabase intake_sessions table (persistent across serverless instances)
 * 2. FALLBACK: In-memory Map via lib/intake-session-store (local dev / DB unavailable)
 *
 * Primitive shape normalizer (pre-LLM):
 * Before calling the LLM, we check for canonical geometric primitives:
 *   - "cube" / "Xmm cube" → family=standoff_block, equal dims, no clarification
 *   - "cylinder" → family=spacer, solid cylinder
 *   - "ring"/"spacer"/"bushing" → family=spacer, with bore
 * This ensures "make a cube with 5mm sides" never routes to spacer/jig.
 *
 * Image processing errors are caught and degraded gracefully — the route
 * continues with text-only interpretation rather than returning a 500.
 */

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getAuthUser } from "@/lib/auth";
import { randomUUID } from "crypto";
import { setIntakeSession } from "@/lib/intake-session-store";
import { tryNormalizePrimitive } from "@/lib/primitive-normalizer";

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
  is_primitive?: boolean;
}

interface FileInterpretation {
  file_name: string;
  file_category: "image" | "document" | "svg" | "unknown";
  interpretation: string;
  analysis_notes: string;
}

interface JsonRequestBody {
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
  "family_candidate": string or null (one of: spacer, l_bracket, u_bracket, hole_plate, cable_clip, enclosure, flat_bracket, standoff_block, adapter_bushing, simple_jig),
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

// ── Commit SHA baked in at build time ────────────────────────────────────────
const COMMIT_SHA = process.env.VERCEL_GIT_COMMIT_SHA ?? "local";

export async function POST(req: NextRequest) {
  try {
    const openai = new OpenAI();

    // ── Owner probe bypass (ADMIN_BYPASS_KEY header) ──────────────────────────
    // Allows owner to probe the live route without a Clerk session.
    // NEVER leaks secrets — only returns debug fields, not env vars.
    const probeKey = req.headers.get("x-admin-bypass-key");
    // Trim env var to handle trailing newlines or whitespace from Vercel env storage
    const adminBypassKey = process.env.ADMIN_BYPASS_KEY?.trim();
    const isOwnerProbe = adminBypassKey && probeKey?.trim() === adminBypassKey;

    const user = await getAuthUser();
    if (!user && !isOwnerProbe) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // For probe requests, use a stable synthetic user
    const effectiveUser = user ?? { id: "owner-probe", email: "owner@ai4u.app" };

    // ── Parse request body (JSON or multipart/form-data) ──────────────────────
    const contentType = req.headers.get("content-type") ?? "";

    let text = "";
    let voice_transcript: string | undefined;
    let session_id: string | undefined;
    let conversation_history: Array<{ role: "user" | "assistant"; content: string }> = [];
    let jsonFiles: JsonRequestBody["files"] = [];
    let multipartImageDataUrl: string | null = null;
    let multipartFileName = "";
    let multipartFileType = "";
    let multipartFileSize = 0;

    if (contentType.includes("multipart/form-data")) {
      // Handle multipart/form-data (image upload from the UI)
      let form: FormData;
      try {
        form = await req.formData();
      } catch (formErr) {
        console.error("[/api/intake/interpret] Failed to parse form data:", formErr);
        return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
      }

      text = form.get("text")?.toString() ?? "";
      voice_transcript = form.get("voice_transcript")?.toString();
      session_id = form.get("session_id")?.toString();
      const historyRaw = form.get("conversation_history")?.toString();
      if (historyRaw) {
        try {
          conversation_history = JSON.parse(historyRaw);
        } catch {
          conversation_history = [];
        }
      }

      // Process uploaded file (if any)
      const file = form.get("file") as File | null;
      if (file && file.size > 0) {
        try {
          const buffer = await file.arrayBuffer();
          const base64 = Buffer.from(buffer).toString("base64");
          multipartImageDataUrl = `data:${file.type};base64,${base64}`;
          multipartFileName = file.name;
          multipartFileType = file.type;
          multipartFileSize = file.size;
        } catch (fileErr) {
          // Graceful degradation: log and continue with text-only
          console.error("[/api/intake/interpret] Image processing failed:", fileErr);
          multipartImageDataUrl = null;
        }
      }
    } else {
      // Handle application/json
      let body: JsonRequestBody;
      try {
        body = await req.json();
      } catch (jsonErr) {
        console.error("[/api/intake/interpret] Failed to parse JSON body:", jsonErr);
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
      }
      text = body.text ?? "";
      jsonFiles = body.files ?? [];
      voice_transcript = body.voice_transcript;
      session_id = body.session_id;
      conversation_history = body.conversation_history ?? [];
    }

    // Validate: at least some input
    const hasInput =
      text.trim() ||
      (voice_transcript?.trim()) ||
      (jsonFiles && jsonFiles.length > 0) ||
      multipartImageDataUrl;

    if (!hasInput) {
      return NextResponse.json({ error: "No input provided" }, { status: 400 });
    }

    const combinedText = [
      text,
      voice_transcript ? `[Voice transcript: ${voice_transcript}]` : null,
    ]
      .filter(Boolean)
      .join("\n\n");

    // ── PRIMITIVE SHAPE NORMALIZER (pre-LLM fast path) ────────────────────────
    // For text-only requests, check if the prompt is a canonical geometric primitive.
    // If so, bypass the LLM entirely and return a fully-resolved spec.
    // This prevents "cube" from routing to spacer/jig families.
    const primitiveResult = (jsonFiles?.length === 0 && !multipartImageDataUrl)
      ? tryNormalizePrimitive(combinedText)
      : null;

    if (primitiveResult) {
      const activeSessionId = session_id ?? randomUUID();
      const sessionState: Record<string, unknown> = {
        clerk_user_id: effectiveUser.id,
        mode: "parametric_part",
        family_candidate: primitiveResult.family,
        extracted_dimensions: primitiveResult.parameters,
        inferred_scale: null,
        inferred_object_type: null,
        missing_information: [],
        assistant_message: primitiveResult.reasoning,
        preview_strategy: "parametric_render",
        confidence: primitiveResult.confidence,
        is_primitive: true,
        conversation_history: [
          ...conversation_history,
          { role: "user", content: combinedText },
          { role: "assistant", content: primitiveResult.reasoning },
        ],
        status: "active",
      };
      await setIntakeSession(activeSessionId, sessionState, effectiveUser.id);

      const result: InterpretationResult & Record<string, unknown> = {
        mode: "parametric_part",
        family_candidate: primitiveResult.family,
        extracted_dimensions: primitiveResult.parameters,
        inferred_scale: null,
        inferred_object_type: null,
        missing_information: [],
        assistant_message: primitiveResult.reasoning,
        preview_strategy: "parametric_render",
        confidence: primitiveResult.confidence,
        file_interpretations: [],
        session_id: activeSessionId,
        is_primitive: true,
        // ── Production proof instrumentation ───────────────────────────────────
        _proof: {
          commit_sha: COMMIT_SHA,
          source: "primitive_fast_path",
          llm_bypassed: true,
          primitive_family: primitiveResult.family,
          primitive_parameters: primitiveResult.parameters,
          code_path: "apps/web/app/api/intake/interpret/route.ts:primitive_normalizer",
          is_owner_probe: isOwnerProbe ?? false,
        },
      };
      const proofHeaders = new Headers();
      proofHeaders.set("x-commit-sha", COMMIT_SHA);
      proofHeaders.set("x-source", "primitive_fast_path");
      proofHeaders.set("x-llm-bypassed", "true");
      proofHeaders.set("x-primitive-family", primitiveResult.family);
      return NextResponse.json(result, { headers: proofHeaders });
    }

    // ── Build LLM messages ────────────────────────────────────────────────────
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM_PROMPT },
    ];

    // Add conversation history (last 6 turns)
    for (const msg of conversation_history.slice(-6)) {
      messages.push({ role: msg.role, content: msg.content });
    }

    // Build the user message content (multimodal)
    const userContent: OpenAI.Chat.ChatCompletionContentPart[] = [];

    if (combinedText) {
      userContent.push({ type: "text", text: combinedText });
    }

    // JSON path: process files array
    const imageFiles = (jsonFiles ?? []).filter(
      (f) =>
        f.type.startsWith("image/") &&
        f.type !== "image/svg+xml" &&
        f.dataUrl.startsWith("data:")
    );

    // Gracefully handle image content (catch vision errors)
    for (const img of imageFiles.slice(0, 3)) {
      try {
        userContent.push({
          type: "image_url",
          image_url: { url: img.dataUrl, detail: "low" },
        });
      } catch (imgErr) {
        console.error("[/api/intake/interpret] Failed to add image to message:", imgErr);
        // Continue without this image
      }
    }

    // Multipart path: add uploaded image
    if (multipartImageDataUrl) {
      try {
        userContent.push({
          type: "image_url",
          image_url: { url: multipartImageDataUrl, detail: "low" },
        });
      } catch (imgErr) {
        console.error("[/api/intake/interpret] Failed to add multipart image to message:", imgErr);
        // Continue without image
      }
    }

    const docFiles = (jsonFiles ?? []).filter(
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

    // ── Call LLM ──────────────────────────────────────────────────────────────
    let parsed: Partial<InterpretationResult> = {};
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages,
        temperature: 0.1,
        max_tokens: 600,
        response_format: { type: "json_object" },
      });
      parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
    } catch (llmErr) {
      console.error("[/api/intake/interpret] LLM call failed:", llmErr);
      parsed = {
        mode: "needs_clarification",
        assistant_message:
          "I had trouble understanding that. Could you describe what you want to print in a sentence or two?",
        confidence: 0,
      };
    }

    if (!INTERPRETATION_MODES.includes(parsed.mode as InterpretationMode)) {
      parsed.mode = "needs_clarification";
    }

    // ── Build file interpretations ────────────────────────────────────────────
    const allFiles = [
      ...(jsonFiles ?? []).map((f) => ({ name: f.name, type: f.type, size: f.size })),
      ...(multipartImageDataUrl
        ? [{ name: multipartFileName, type: multipartFileType, size: multipartFileSize }]
        : []),
    ];

    const fileInterpretations: FileInterpretation[] = allFiles.map((f) => {
      const isImage = f.type.startsWith("image/") && f.type !== "image/svg+xml";
      const isSvg = f.type === "image/svg+xml";
      const isDoc = !isImage && !isSvg;
      return {
        file_name: f.name,
        file_category: isImage ? "image" : isSvg ? "svg" : isDoc ? "document" : "unknown",
        interpretation: isImage
          ? parsed.mode === "image_to_relief"
            ? "flat_relief"
            : "reference_image"
          : isSvg
          ? "svg_extrusion_candidate"
          : "reference_document",
        analysis_notes: `Received ${f.name} (${(f.size / 1024).toFixed(1)}KB)`,
      };
    });

    // ── Session state ─────────────────────────────────────────────────────────
    const activeSessionId = session_id ?? randomUUID();

    const sessionState: Record<string, unknown> = {
      clerk_user_id: effectiveUser.id,
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

    // Write to DB (primary) + memory (fallback) — async, non-blocking for response
    await setIntakeSession(activeSessionId, sessionState, effectiveUser.id);

    const result: InterpretationResult & Record<string, unknown> = {
      mode: (parsed.mode as InterpretationMode) ?? "needs_clarification",
      family_candidate: parsed.family_candidate ?? null,
      extracted_dimensions: parsed.extracted_dimensions ?? {},
      inferred_scale: parsed.inferred_scale ?? null,
      inferred_object_type: parsed.inferred_object_type ?? null,
      missing_information: parsed.missing_information ?? [],
      assistant_message:
        parsed.assistant_message ?? "Tell me more about what you want to create.",
      preview_strategy: parsed.preview_strategy ?? null,
      confidence: parsed.confidence ?? 0,
      file_interpretations: fileInterpretations,
      session_id: activeSessionId,
      // ── Production proof instrumentation ───────────────────────────────────
      _proof: {
        commit_sha: COMMIT_SHA,
        source: "llm_interpret",
        llm_bypassed: false,
        code_path: "apps/web/app/api/intake/interpret/route.ts:llm_path",
        is_owner_probe: isOwnerProbe ?? false,
      },
    };

    const proofHeaders = new Headers();
    proofHeaders.set("x-commit-sha", COMMIT_SHA);
    proofHeaders.set("x-source", "llm_interpret");
    proofHeaders.set("x-llm-bypassed", "false");
    return NextResponse.json(result, { headers: proofHeaders });
  } catch (err) {
    console.error("[/api/intake/interpret]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
