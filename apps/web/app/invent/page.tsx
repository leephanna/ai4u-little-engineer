/**
 * /invent
 *
 * Universal Creation Engine UI.
 * Reads optional ?q= search param and passes it as initialPrompt to
 * UniversalCreatorFlow so Gallery "Make This" buttons auto-fill + auto-submit.
 */

"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import UniversalCreatorFlow from "@/components/intake/UniversalCreatorFlow";

function InventContent() {
  const searchParams = useSearchParams();
  const q = searchParams.get("q") ?? searchParams.get("prompt") ?? undefined;

  return (
    <div className="min-h-screen bg-steel-950">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-steel-100">Invent a Design</h1>
          <p className="mt-2 text-steel-400">
            Describe a mechanical problem in plain English — or upload a photo, sketch, or
            document. AI4U will design a 3D-printable solution, generate the CAD files, and
            let you save, publish, or sell it.
          </p>
        </div>
        <UniversalCreatorFlow initialPrompt={q} />
      </div>
    </div>
  );
}

export default function InventPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-steel-950 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <InventContent />
    </Suspense>
  );
}
