/**
 * POST /api/intake/clarify
 *
 * Guided clarification engine for non-technical users.
 * Given the current interpretation state and a user reply,
 * returns the next consumer-friendly follow-up question and
 * an updated interpretation result.
 *
 * Session storage strategy (DB-primary, memory-fallback):
 * 1. PRIMARY: Supabase intake_sessions table (persistent across serverless instances)
 * 2. FALLBACK: In-memory Map (local dev / DB unavailable)
 *
 * If session is not found in either store, returns 404 with
 * "Session expired. Please start over."
 */

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getAuthUser } from "@/lib/auth";
import { getIntakeSession, setIntakeSession } from "@/lib/intake-session-store";

interface ClarifyBody {
  session_id: string;
  user_reply: string;
}

// ── Normalization map ─────────────────────────────────────────────────────────
function normalizeUserReply(reply: string): string {
  return reply
    .replace(/\bmoderate\s+detail\b/gi, "medium detail")
    .replace(/\bmoderate\b/gi, "medium")
    .replace(/\bnormal\s+detail\b/gi, "medium detail")
    .replace(/\bhigh\s+detail\b/gi, "high detail")
    .replace(/\bdetailed\b/gi, "high detail")
    .replace(/\bfine\s+detail\b/gi, "high detail")
    .replace(/\bsimple\b/gi, "low detail")
    .replace(/\bbasic\b/gi, "low detail")
    .replace(/\blow\s+detail\b/gi, "low detail")
    .replace(/\bany\s+color\b/gi, "unspecified color")
    .replace(/\bno\s+color\s+preference\b/gi, "unspecified color")
    .replace(/\bdoesn'?t\s+matter\s+(?:what\s+)?color\b/gi, "unspecified color")
    .replace(/\bany\s+material\b/gi, "unspecified material")
    .replace(/\bno\s+material\s+preference\b/gi, "unspecified material")
    .replace(/\bdoesn'?t\s+matter\s+(?:what\s+)?material\b/gi, "unspecified material");
}

const CLARIFY_SYSTEM_PROMPT = `You are the AI4U Little Engineer guided clarification assistant.
Your job is to help non-technical users describe what they want to 3D print.

You are given the current interpretation state and the user's latest reply.
Return ONLY a JSON object with these fields:
{
  "updated_dimensions": object — ALL numeric values in mm extracted so far (merge with existing, never drop prior values),
  "fit_envelope": object or null — if the user wants something "sized to fit" another object, extract the envelope dimensions here (e.g. {"base_diameter_mm": 40, "height_mm": 120}),
  "updated_missing_information": array of strings — fields still needed (remove any that were just answered),
  "updated_confidence": number 0.0-1.0,
  "updated_inferred_scale": string or null,
  "updated_inferred_object_type": string or null,
  "next_question": string — ONE simple, friendly follow-up question (or null if ready to proceed),
  "ready_to_generate": boolean — true only if you have enough to start generation,
  "assistant_message": string — friendly 1-2 sentence response to the user,
  "updated_mode": string — same or updated interpretation mode
}

Critical rules:
1. NEVER drop previously extracted dimension values. Always include them in updated_dimensions.
2. A single user reply may contain multiple dimensions (e.g. "120mm tall, 40mm base"). Extract ALL of them.
3. If the user says "sized to fit [object]" or "scaled to [object]", populate fit_envelope with the reference object's dimensions and set updated_mode to "derived_fit".
4. Ask only ONE question at a time. If multiple things are missing, ask the most important one first.
5. Use simple, everyday language. No jargon unless the user used it.
6. If the user gives a size like "about the size of my hand", convert to approximate mm (palm ≈ 80mm).
7. If ready_to_generate is true, assistant_message should be an enthusiastic confirmation.
8. Never ask for information that is not strictly needed to generate the part.
9. For "rocket sized to fit stand" requests: if you have the stand dimensions, derive a reasonable rocket size that fits (e.g. rocket height ≈ 2.5× stand base diameter). Set ready_to_generate=true with the derived values.
10. "unspecified color" and "unspecified material" are valid values — treat them as acceptable and do NOT ask about them again.
11. If the user has provided object type, approximate size, and detail level, set ready_to_generate=true. Material and color are optional.
12. Prefer advancing to generation over asking another question when enough information exists.

Example questions to ask:
- "Should this be a flat decorative piece or a full 3D object?"
- "About how big do you want it? (e.g., palm-sized, about 10cm, or desk ornament)"
- "Will this be for display or actual use?"
- "Do you want it detailed or easy/fast to print?"`;

export async function POST(req: NextRequest) {
  try {
    const openai = new OpenAI();
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: ClarifyBody = await req.json();
    const { session_id, user_reply } = body;

    if (!session_id || !user_reply?.trim()) {
      return NextResponse.json(
        { error: "session_id and user_reply are required" },
        { status: 400 }
      );
    }

    // ── Session lookup (DB-primary via getIntakeSession) ──────────────────────
    const session = await getIntakeSession(session_id);

    if (!session) {
      return NextResponse.json(
        { error: "Session expired. Please start over." },
        { status: 404 }
      );
    }

    // Verify the session belongs to this user
    if (session.clerk_user_id && session.clerk_user_id !== user.id) {
      return NextResponse.json(
        { error: "Session expired. Please start over." },
        { status: 404 }
      );
    }

    // Read fail count defensively
    const currentFailCount: number =
      typeof session.clarify_fail_count === "number" ? session.clarify_fail_count : 0;

    // If we've already failed twice, return the fallback form signal immediately
    if (currentFailCount >= 2) {
      return NextResponse.json({
        session_id,
        next_question: null,
        ready_to_generate: false,
        assistant_message: "Let me show you a quick form instead — it'll be faster.",
        updated_dimensions: session.extracted_dimensions ?? {},
        updated_missing_information: session.missing_information ?? [],
        updated_confidence: session.confidence ?? 0,
        updated_mode: session.mode ?? "needs_clarification",
        fit_envelope: session.fit_envelope ?? null,
        fallback_form: true,
      });
    }

    const normalizedReply = normalizeUserReply(user_reply);

    const stateContext = JSON.stringify({
      mode: session.mode,
      family_candidate: session.family_candidate,
      extracted_dimensions: session.extracted_dimensions,
      fit_envelope: session.fit_envelope ?? null,
      inferred_scale: session.inferred_scale,
      inferred_object_type: session.inferred_object_type,
      missing_information: session.missing_information,
      confidence: session.confidence,
    });

    const history = (session.conversation_history as Array<{ role: string; content: string }>) ?? [];

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: CLARIFY_SYSTEM_PROMPT },
      {
        role: "system",
        content: `Current interpretation state (PRESERVE all extracted_dimensions values): ${stateContext}`,
      },
      ...history.slice(-10).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user", content: normalizedReply },
    ];

    let parsed: Record<string, unknown> = {};
    let llmFailed = false;
    let llmError = "";

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages,
        temperature: 0.2,
        max_tokens: 600,
        response_format: { type: "json_object" },
      });

      const raw = completion.choices[0]?.message?.content ?? "{}";
      parsed = JSON.parse(raw);

      if (typeof parsed.ready_to_generate !== "boolean") {
        throw new Error("Invalid LLM response: missing ready_to_generate");
      }
    } catch (e) {
      llmFailed = true;
      llmError = e instanceof Error ? e.message : String(e);
      console.warn("[/api/intake/clarify] LLM failed:", llmError);
    }

    if (llmFailed) {
      const newFailCount = currentFailCount + 1;
      const updatedSession = { ...session, clarify_fail_count: newFailCount };
      await setIntakeSession(session_id, updatedSession, session.clerk_user_id as string | undefined);

      const missing = (session.missing_information as string[]) ?? [];
      const dims = (session.extracted_dimensions as Record<string, number>) ?? {};

      let targetedQuestion = "Could you describe what you want to make and roughly how big?";
      if (missing.includes("size") || missing.includes("dimensions") || Object.keys(dims).length === 0) {
        targetedQuestion = "How big should this be? (e.g., palm-sized, 10cm tall, or desk ornament size)";
      } else if (missing.includes("material")) {
        targetedQuestion = "What material would you like? PLA is great for most prints.";
      } else if (missing.includes("purpose") || missing.includes("use")) {
        targetedQuestion = "Will this be for display or actual use?";
      }

      const fallbackForm = newFailCount >= 2;

      return NextResponse.json({
        session_id,
        next_question: fallbackForm ? null : targetedQuestion,
        ready_to_generate: false,
        assistant_message: fallbackForm
          ? "Let me show you a quick form instead — it'll be faster."
          : targetedQuestion,
        updated_dimensions: dims,
        updated_missing_information: missing,
        updated_confidence: session.confidence ?? 0,
        updated_mode: session.mode ?? "needs_clarification",
        fit_envelope: session.fit_envelope ?? null,
        fallback_form: fallbackForm,
      });
    }

    // ── Success path ──────────────────────────────────────────────────────────
    const mergedDimensions = {
      ...(session.extracted_dimensions as Record<string, number> ?? {}),
      ...(parsed.updated_dimensions as Record<string, number> ?? {}),
    };

    const updatedHistory = [
      ...history,
      { role: "user", content: user_reply },
      { role: "assistant", content: (parsed.assistant_message as string) ?? "" },
    ];

    const updatePayload: Record<string, unknown> = {
      extracted_dimensions: mergedDimensions,
      missing_information: parsed.updated_missing_information ?? session.missing_information,
      confidence: parsed.updated_confidence ?? session.confidence,
      inferred_scale: parsed.updated_inferred_scale ?? session.inferred_scale,
      inferred_object_type: parsed.updated_inferred_object_type ?? session.inferred_object_type,
      mode: parsed.updated_mode ?? session.mode,
      assistant_message: parsed.assistant_message ?? session.assistant_message,
      conversation_history: updatedHistory,
      clarify_fail_count: 0,
      updated_at: new Date().toISOString(),
    };

    if (parsed.fit_envelope) {
      updatePayload.fit_envelope = parsed.fit_envelope;
    }

    // Write updated session (DB-primary + memory)
    await setIntakeSession(
      session_id,
      { ...session, ...updatePayload },
      session.clerk_user_id as string | undefined
    );

    return NextResponse.json({
      session_id,
      next_question: parsed.next_question ?? null,
      ready_to_generate: parsed.ready_to_generate ?? false,
      assistant_message: parsed.assistant_message ?? "",
      updated_dimensions: mergedDimensions,
      fit_envelope: parsed.fit_envelope ?? null,
      updated_missing_information: parsed.updated_missing_information ?? [],
      updated_confidence: parsed.updated_confidence ?? 0,
      updated_mode: parsed.updated_mode ?? session.mode,
      fallback_form: false,
    });
  } catch (err) {
    console.error("[/api/intake/clarify] Unhandled error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
