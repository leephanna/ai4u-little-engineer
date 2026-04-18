/**
 * Intake session store — DB-primary, memory-fallback.
 *
 * PRIMARY:  Supabase `intake_sessions` table (persistent across serverless instances)
 *           Schema: { id UUID, session_id TEXT UNIQUE, clerk_user_id TEXT, state JSONB,
 *                     created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ }
 * FALLBACK: In-memory Map (local dev when DB is unavailable, or as a fast cache)
 *
 * The entire session state is stored as a single JSONB blob in the `state` column.
 * This matches the actual live DB schema (created by migration 016).
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

  // Always write to DB (primary) — stores entire state as JSONB blob in `state` column
  try {
    const supabase = createServiceClient();
    const resolvedClerkUserId =
      clerkUserId ?? (state.clerk_user_id as string | undefined) ?? null;

    const { error } = await supabase
      .from("intake_sessions")
      .upsert(
        {
          session_id: sessionId,
          clerk_user_id: resolvedClerkUserId,
          state: state,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "session_id" }
      );

    if (error) {
      console.warn("[intake-session-store] DB upsert error:", error.message);
    }
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
      .select("state, clerk_user_id, session_id")
      .eq("session_id", sessionId)
      .single();

    if (!error && data) {
      // The state is stored as a JSONB blob in the `state` column
      const sessionState = (data.state as Record<string, unknown>) ?? {};
      // Ensure clerk_user_id is accessible at the top level
      if (data.clerk_user_id && !sessionState.clerk_user_id) {
        sessionState.clerk_user_id = data.clerk_user_id;
      }
      // Warm the local cache
      memoryStore.set(sessionId, {
        data: sessionState,
        expiresAt: Date.now() + SESSION_TTL_MS,
      });
      return sessionState;
    }
  } catch (dbErr) {
    console.warn("[intake-session-store] DB read failed:", dbErr);
  }

  return null;
}
