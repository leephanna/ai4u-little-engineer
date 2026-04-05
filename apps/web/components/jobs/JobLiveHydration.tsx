"use client";
/**
 * JobLiveHydration
 *
 * Client component that polls the job status API and triggers a router refresh
 * until the job reaches a terminal state. Mounted by the job detail Server Component
 * when the job is in a non-terminal state (generating, queued, clarifying).
 *
 * Strategy: use router.refresh() (Next.js App Router) which re-fetches all Server
 * Component data for the current route without a full page reload. This is the
 * recommended approach for App Router pages — no need for a separate client-side
 * data layer.
 *
 * Poll intervals:
 *   - First 2 minutes: every 5s
 *   - 2–5 minutes:     every 10s
 *   - After 5 minutes: every 30s (give up after 10 minutes total)
 */
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const TERMINAL_STATUSES = new Set([
  "approved",
  "rejected",
  "printed",
  "completed",
  "failed",
]);

interface Props {
  jobId: string;
  currentStatus: string;
}

export function JobLiveHydration({ jobId, currentStatus }: Props) {
  const router = useRouter();
  const startedAt = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Already terminal — nothing to do
    if (TERMINAL_STATUSES.has(currentStatus)) return;

    let cancelled = false;

    async function poll() {
      if (cancelled) return;

      const elapsed = Date.now() - startedAt.current;

      // Give up after 10 minutes
      if (elapsed > 10 * 60 * 1000) return;

      try {
        const res = await fetch(`/api/jobs/${jobId}/status`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const { status } = await res.json() as { status: string };

        if (TERMINAL_STATUSES.has(status)) {
          // Terminal — do one final refresh to show the completed state
          router.refresh();
          return;
        }

        // Not terminal yet — refresh the page data and schedule next poll
        router.refresh();
      } catch {
        // Network error — just retry
      }

      if (cancelled) return;

      // Determine next poll interval based on elapsed time
      const interval =
        elapsed < 2 * 60 * 1000 ? 5_000 :
        elapsed < 5 * 60 * 1000 ? 10_000 :
        30_000;

      timerRef.current = setTimeout(poll, interval);
    }

    // Start polling after a short initial delay
    timerRef.current = setTimeout(poll, 3_000);

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [jobId, currentStatus, router]);

  // This component renders nothing — it's a pure side-effect component
  return null;
}
