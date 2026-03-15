"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { VoiceSession } from "@/components/voice/VoiceSession";
import { createClient } from "@/lib/supabase/client";

export default function NewJobPage() {
  const router = useRouter();
  const [sessionId] = useState(() => crypto.randomUUID());
  const [jobId, setJobId] = useState<string | undefined>(undefined);
  const [specReady, setSpecReady] = useState(false);

  const handleJobCreated = useCallback((newJobId: string) => {
    setJobId(newJobId);
  }, []);

  const handleSpecReady = useCallback(
    (spec: Record<string, unknown>) => {
      setSpecReady(true);
      if (jobId) {
        // Navigate to job detail after a short delay
        setTimeout(() => {
          router.push(`/jobs/${jobId}`);
        }, 1500);
      }
    },
    [jobId, router]
  );

  return (
    <div className="min-h-screen bg-steel-900 flex flex-col">
      {/* Header */}
      <header className="border-b border-steel-800 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="text-steel-400 hover:text-steel-100 transition-colors p-1"
          aria-label="Go back"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="font-semibold text-steel-100">New Part Request</h1>
          {jobId && (
            <p className="text-xs text-steel-500">Job {jobId.slice(0, 8)}…</p>
          )}
        </div>
        {specReady && (
          <div className="ml-auto flex items-center gap-2 text-green-400 text-sm">
            <span className="w-2 h-2 bg-green-400 rounded-full" />
            Spec ready
          </div>
        )}
      </header>

      {/* Voice session fills remaining height */}
      <div className="flex-1 min-h-0">
        <VoiceSession
          sessionId={sessionId}
          jobId={jobId}
          onJobCreated={handleJobCreated}
          onSpecReady={handleSpecReady}
        />
      </div>
    </div>
  );
}
