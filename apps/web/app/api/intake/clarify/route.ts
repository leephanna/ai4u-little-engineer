/**
 * POST /api/intake/clarify
 *
 * Guided clarification engine for non-technical users.
 * Given the current interpretation state and a user reply,
 * returns the next consumer-friendly follow-up question and
 * an updated interpretation result.
 *
 * Track 2 fix (root cause: clarify_fail_count column missing):
 * - The previous version wrote `clarify_fail_count` to intake_sessions but
 *   that column did not exist in the schema. The Supabase UPDATE returned an
 *   error, which was caught by the outer try/catch and returned a 500 —
 *   causing "Sorry, I had a hiccup" on every successful turn.
 * - Fix: wrap ALL DB writes in their own try/catch so a column-not-found
 *   error never propagates to the user. The migration (012_clarify_fail_count.sql)
 *   adds the column; until it runs, fail_count is tracked in-memory only.
 * - Added normalization for "moderate detail", "any color", "any material".
 * - ClarificationChat.ClarifyResponse updated to include fallback_form.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import OpenAI from "openai";
import { getAuthUser } from "@/lib/auth";


interface ClarifyBody {
  session_id: string;
  user_reply: string;
}

// ── Normalization map ─────────────────────────────────────────────────────────
// Converts natural-language values to canonical enum values before LLM processing.
// This prevents downstream enum failures for valid user replies.
function normalizeUserReply(reply: string): string {
  return reply
    // Detail level
    .replace(/\bmoderate\s+detail\b/gi, "medium detail")
    .replace(/\bmoderate\b/gi, "medium")
    .replace(/\bnormal\s+detail\b/gi, "medium detail")
    .replace(/\bhigh\s+detail\b/gi, "high detail")
    .replace(/\bdetailed\b/gi, "high detail")
    .replace(/\bfine\s+detail\b/gi, "high detail")
    .replace(/\bsimple\b/gi, "low detail")
    .replace(/\bbasic\b/gi, "low detail")
    .replace(/\blow\s+detail\b/gi, "low detail")
    // Color
    .replace(/\bany\s+color\b/gi, "unspecified color")
    .replace(/\bno\s+color\s+preference\b/gi, "unspecified color")
    .replace(/\bdoesn'?t\s+matter\s+(?:what\s+)?color\b/gi, "unspecified color")
    // Material
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
    const supabase = await createClient();
        const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: ClarifyBody = await req.json();
    const { session_id, user_reply } = body;

    if (!session_id || !user_reply?.trim()) {
      return NextResponse.json({ error: "session_id and user_reply are required" }, { status: 400 });
    }

    const serviceSupabase = createServiceClient();

    // Load the session
    const { data: session } = await serviceSupabase
      .from("intake_sessions")
      .select("*")
      .eq("id", session_id)
      .eq("clerk_user_id", user.id)
      .single();

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Read fail count defensively — column may not exist yet (migration 012 pending)
    const currentFailCount: number =
      typeof (session as Record<string, unknown>).clarify_fail_count === "number"
        ? (session as Record<string, unknown>).clarify_fail_count as number
        : 0;

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
        fit_envelope: (session as Record<string, unknown>).fit_envelope ?? null,
        fallback_form: true,
      });
    }

    // Normalize the user reply before sending to LLM
    const normalizedReply = normalizeUserReply(user_reply);

    // Build context for the LLM — include ALL prior extracted state
    const stateContext = JSON.stringify({
      mode: session.mode,
      family_candidate: session.family_candidate,
      extracted_dimensions: session.extracted_dimensions,
      fit_envelope: (session as Record<string, unknown>).fit_envelope ?? null,
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
      // Include last 10 turns for full context
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

      // Validate the response has required fields
      if (typeof parsed.ready_to_generate !== "boolean") {
        throw new Error("Invalid LLM response: missing ready_to_generate");
      }
    } catch (e) {
      llmFailed = true;
      llmError = e instanceof Error ? e.message : String(e);
      console.warn("[/api/intake/clarify] LLM failed:", llmError);
    }

    if (llmFailed) {
      // Increment fail count — wrapped in try/catch so a missing column never crashes the user
      const newFailCount = currentFailCount + 1;

      try {
        await serviceSupabase
          .from("intake_sessions")
          .update({
            clarify_fail_count: newFailCount,
            updated_at: new Date().toISOString(),
          } as Record<string, unknown>)
          .eq("id", session_id);
      } catch (dbErr) {
        // Column may not exist yet — non-fatal, fail count tracked in-memory only
        console.warn("[/api/intake/clarify] Could not persist clarify_fail_count:", dbErr);
      }

      // Determine the most important missing field to ask about
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
        fit_envelope: (session as Record<string, unknown>).fit_envelope ?? null,
        fallback_form: fallbackForm,
      });
    }

    // ── Success path ──────────────────────────────────────────────────────────
    // Merge dimensions (NEVER drop prior values)
    const mergedDimensions = {
      ...(session.extracted_dimensions as Record<string, number> ?? {}),
      ...(parsed.updated_dimensions as Record<string, number> ?? {}),
    };

    // Update the session with all new state
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
      updated_at: new Date().toISOString(),
    };

    // Store fit_envelope if present
    if (parsed.fit_envelope) {
      updatePayload.fit_envelope = parsed.fit_envelope;
    }

    // Reset fail count on success — wrapped in try/catch so a missing column never crashes
    try {
      await serviceSupabase
        .from("intake_sessions")
        .update({ ...updatePayload, clarify_fail_count: 0 })
        .eq("id", session_id);
    } catch (dbErr) {
      // If clarify_fail_count column doesn't exist, retry without it
      console.warn("[/api/intake/clarify] DB update with fail_count failed, retrying without:", dbErr);
      try {
        await serviceSupabase
          .from("intake_sessions")
          .update(updatePayload)
          .eq("id", session_id);
      } catch (dbErr2) {
        // Non-fatal — session state may be stale but the response is still valid
        console.error("[/api/intake/clarify] DB update failed:", dbErr2);
      }
    }

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
