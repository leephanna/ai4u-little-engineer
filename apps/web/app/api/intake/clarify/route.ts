/**
 * POST /api/intake/clarify
 *
 * Guided clarification engine for non-technical users.
 * Given the current interpretation state and a user reply,
 * returns the next consumer-friendly follow-up question and
 * an updated interpretation result.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import OpenAI from "openai";

const openai = new OpenAI();

interface ClarifyBody {
  session_id: string;
  user_reply: string;
}

const CLARIFY_SYSTEM_PROMPT = `You are the AI4U Little Engineer guided clarification assistant.
Your job is to help non-technical users describe what they want to 3D print.

You are given the current interpretation state and the user's latest reply.
Return a JSON object with:
{
  "updated_dimensions": object with any newly extracted numeric values in mm,
  "updated_missing_information": array of strings still missing,
  "updated_confidence": number 0.0-1.0,
  "updated_inferred_scale": string or null,
  "next_question": string — ONE simple, friendly follow-up question (or null if ready to proceed),
  "ready_to_generate": boolean — true only if you have enough to start generation,
  "assistant_message": string — friendly 1-2 sentence response to the user,
  "updated_mode": string — same or updated interpretation mode
}

Rules:
- Ask only ONE question at a time.
- Use simple, everyday language. No jargon unless the user used it.
- If the user gives a size like "about the size of my hand", convert to approximate mm (palm ≈ 80mm).
- If ready_to_generate is true, assistant_message should be an enthusiastic confirmation.
- Never ask for information that is not strictly needed to generate the part.

Example questions to ask:
- "Should this be a flat decorative piece or a full 3D object?"
- "About how big do you want it? (e.g., palm-sized, about 10cm, or desk ornament)"
- "Will this be for display or actual use?"
- "What printer and material are you using? (or should I use standard settings?)"
- "Do you want it detailed or easy/fast to print?"`;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
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
      .eq("user_id", user.id)
      .single();

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Build context for the LLM
    const stateContext = JSON.stringify({
      mode: session.mode,
      family_candidate: session.family_candidate,
      extracted_dimensions: session.extracted_dimensions,
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
        content: `Current interpretation state: ${stateContext}`,
      },
      ...history.slice(-8).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user", content: user_reply },
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages,
      temperature: 0.2,
      max_tokens: 400,
      response_format: { type: "json_object" },
    });

    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
    } catch {
      parsed = {
        next_question: "Could you tell me a bit more about what you have in mind?",
        ready_to_generate: false,
        assistant_message: "I want to make sure I get this right. Could you tell me a bit more?",
        updated_confidence: 0.1,
      };
    }

    // Update the session
    const updatedHistory = [
      ...history,
      { role: "user", content: user_reply },
      { role: "assistant", content: (parsed.assistant_message as string) ?? "" },
    ];

    await serviceSupabase
      .from("intake_sessions")
      .update({
        extracted_dimensions: {
          ...(session.extracted_dimensions as Record<string, number>),
          ...(parsed.updated_dimensions as Record<string, number> ?? {}),
        },
        missing_information: parsed.updated_missing_information ?? session.missing_information,
        confidence: parsed.updated_confidence ?? session.confidence,
        inferred_scale: parsed.updated_inferred_scale ?? session.inferred_scale,
        mode: parsed.updated_mode ?? session.mode,
        assistant_message: parsed.assistant_message ?? session.assistant_message,
        conversation_history: updatedHistory,
        updated_at: new Date().toISOString(),
      })
      .eq("id", session_id);

    return NextResponse.json({
      session_id,
      next_question: parsed.next_question ?? null,
      ready_to_generate: parsed.ready_to_generate ?? false,
      assistant_message: parsed.assistant_message ?? "",
      updated_dimensions: parsed.updated_dimensions ?? {},
      updated_missing_information: parsed.updated_missing_information ?? [],
      updated_confidence: parsed.updated_confidence ?? 0,
      updated_mode: parsed.updated_mode ?? session.mode,
    });
  } catch (err) {
    console.error("[/api/intake/clarify]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
