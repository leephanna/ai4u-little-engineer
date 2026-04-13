/**
 * POST /api/sessions
 * Creates a new voice session row in public.sessions and returns its UUID.
 *
 * This MUST be called before the first voice turn so that:
 *   - voice_turns.session_id has a valid FK parent
 *   - jobs.session_id has a valid FK parent
 *
 * The client (VoiceSession component) calls this on mount and stores the
 * returned session_id for the lifetime of the conversation.
 *
 * Response:
 *   { session_id: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth";

export async function POST(_request: NextRequest) {
  try {
    const supabase = await createClient();

        const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Create a real sessions row keyed off auth.users.id
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .insert({
        clerk_user_id: user.id,
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (sessionError || !session) {
      console.error("Failed to create session:", sessionError);
      return NextResponse.json(
        { error: "Failed to create session" },
        { status: 500 }
      );
    }

    return NextResponse.json({ session_id: session.id });
  } catch (err) {
    console.error("Session creation error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/sessions
 * Marks a session as ended (sets ended_at).
 *
 * Request body: { session_id: string }
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();

        const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { session_id } = body;

    if (!session_id) {
      return NextResponse.json(
        { error: "Missing session_id" },
        { status: 400 }
      );
    }

    // Only update sessions owned by this user (RLS enforces this too)
    const { error } = await supabase
      .from("sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", session_id)
      .eq("clerk_user_id", user.id);

    if (error) {
      console.error("Failed to close session:", error);
      return NextResponse.json(
        { error: "Failed to close session" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Session close error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
