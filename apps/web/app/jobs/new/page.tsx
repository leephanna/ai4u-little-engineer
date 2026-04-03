"use client";

/**
 * /jobs/new
 *
 * Authenticated creation page.
 * Previously rendered VoiceSession (voice-only mic UI).
 * Now renders UniversalCreatorFlow — text + voice + file upload.
 *
 * Fix: Failure 2 — /jobs/new showed old voice-only UI.
 * Root cause: VoiceSession was never replaced after UniversalCreatorFlow was built.
 *
 * NOTE: VoiceSession.tsx is NOT deleted — other code may import it.
 * This page simply stops using it.
 */

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import UniversalCreatorFlow from "@/components/intake/UniversalCreatorFlow";

function NewJobContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialPrompt = searchParams.get("prompt") ?? searchParams.get("q") ?? undefined;

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
          <h1 className="font-semibold text-steel-100">Create a Part</h1>
          <p className="text-xs text-steel-500">Type it, upload it, or say it</p>
        </div>
      </header>

      {/* Universal creator flow fills remaining height */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <UniversalCreatorFlow
          examplePrompts={
            initialPrompt
              ? [initialPrompt]
              : undefined
          }
        />
      </div>
    </div>
  );
}

export default function NewJobPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-steel-900 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <NewJobContent />
    </Suspense>
  );
}
