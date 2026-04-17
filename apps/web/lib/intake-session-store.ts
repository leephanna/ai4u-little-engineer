/**
 * Intake session store — DB-primary, memory-fallback.
 *
 * PRIMARY:  Supabase intake_sessions table (persistent across serverless instances)
 * FALLBACK: In-memory Map (local dev when DB is unavailable, or as a fast cache)
 *
 * The DB table uses `id UUID` as primary key. The session_id passed around
 * by the routes IS that UUID.
 *
 * All functions are async to support the DB path.
 */

import { createServiceClient } from "@/lib/supabase/service";

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface MemoryEntry {
  data: Record<string, unknown>;
  expiresAt: number;
}

const memoryStore = new Map<string, MemoryEntry>();

function pruneExpiredSessions() {
  const now = Date.now();
  for (const [key, entry] of memoryStore.entries()) {
    if (entry.expiresAt < now) {
      memoryStore.delete(key);
    }
  }
}

/**
 * Write session state.
 * 1. Always write to memory (fast local cache).
 * 2. Always upsert to DB (primary persistent store for cross-instance reads).
 */
export async function setIntakeSession(
  sessionId: string,
  state: Record<string, unknown>,
  clerkUserId?: string
): Promise<void> {
  // Always write to memory
  pruneExpiredSessions();
  memoryStore.set(sessionId, {
    data: state,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });

  // Always write to DB (primary)
  try {
    const supabase = createServiceClient();
    const resolvedClerkUserId = clerkUserId ?? (state.clerk_user_id as string | undefined) ?? null;

    await supabase
      .from("intake_sessions")
      .upsert(
        {
          id: sessionId,
          clerk_user_id: resolvedClerkUserId,
          mode: state.mode ?? null,
          family_candidate: state.family_candidate ?? null,
          extracted_dimensions: state.extracted_dimensions ?? {},
          fit_envelope: state.fit_envelope ?? null,
          inferred_scale: state.inferred_scale ?? null,
          inferred_object_type: state.inferred_object_type ?? null,
          missing_information: state.missing_information ?? [],
          assistant_message: state.assistant_message ?? null,
          preview_strategy: state.preview_strategy ?? null,
          confidence: state.confidence ?? 0,
          clarify_fail_count: state.clarify_fail_count ?? 0,
          conversation_history: state.conversation_history ?? [],
          status: state.status ?? "active",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );
  } catch (dbErr) {
    // Non-fatal: memory store already has the session
    console.warn("[intake-session-store] DB write failed, memory-only:", dbErr);
  }
}

/**
 * Read session state.
 * 1. Check memory first (fast).
 * 2. Fall back to DB (cross-instance persistence).
 */
export async function getIntakeSession(
  sessionId: string
): Promise<Record<string, unknown> | null> {
  // Check memory first
  const memEntry = memoryStore.get(sessionId);
  if (memEntry) {
    if (memEntry.expiresAt < Date.now()) {
      memoryStore.delete(sessionId);
    } else {
      return memEntry.data;
    }
  }

  // Fall back to DB
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("intake_sessions")
      .select("*")
      .eq("id", sessionId)
      .single();

    if (!error && data) {
      // Warm the local cache
      memoryStore.set(sessionId, {
        data: data as Record<string, unknown>,
        expiresAt: Date.now() + SESSION_TTL_MS,
      });
      return data as Record<string, unknown>;
    }
  } catch (dbErr) {
    console.warn("[intake-session-store] DB read failed:", dbErr);
  }

  return null;
}
