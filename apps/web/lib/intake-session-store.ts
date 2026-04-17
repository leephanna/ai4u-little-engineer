/**
 * In-memory intake session store.
 *
 * Used as a fallback when the Supabase intake_sessions table doesn't exist.
 * Sessions are short-lived (30 min TTL) — acceptable for serverless environments
 * where sessions are completed within a single conversation.
 *
 * Note: In-memory state is not shared across serverless function instances.
 * For multi-instance deployments, sessions should be backed by Supabase.
 * The dual-layer approach in interpret/clarify routes handles this gracefully.
 */

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface SessionEntry {
  data: Record<string, unknown>;
  expiresAt: number;
}

const sessionStore = new Map<string, SessionEntry>();

function pruneExpiredSessions() {
  const now = Date.now();
  for (const [key, entry] of sessionStore.entries()) {
    if (entry.expiresAt < now) {
      sessionStore.delete(key);
    }
  }
}

export function getIntakeSession(sessionId: string): Record<string, unknown> | null {
  const entry = sessionStore.get(sessionId);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    sessionStore.delete(sessionId);
    return null;
  }
  return entry.data;
}

export function setIntakeSession(sessionId: string, data: Record<string, unknown>) {
  pruneExpiredSessions();
  sessionStore.set(sessionId, {
    data,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
}
