/**
 * /invent
 *
 * Universal Creation Engine UI.
 *
 * Query params:
 *   ?q=<prompt>    — pre-fill the input and auto-submit (old gallery path)
 *   ?spec=<base64> — locked complete spec payload (new gallery path)
 *                    Skips interpret entirely, goes straight to previewing state.
 *
 * The ?spec= path is used by Gallery "Make This" buttons on locked-spec items.
 * It encodes a JSON object: { family, parameters, reasoning, confidence }
 */

"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import UniversalCreatorFlow from "@/components/intake/UniversalCreatorFlow";

interface LockedSpec {
  family: string;
  parameters: Record<string, number>;
  reasoning: string;
  confidence: number;
}

function parseLockedSpec(encoded: string | null): LockedSpec | null {
  if (!encoded) return null;
  try {
    const decoded = decodeURIComponent(escape(atob(decodeURIComponent(encoded))));
    const parsed = JSON.parse(decoded) as LockedSpec;
    if (!parsed.family || !parsed.parameters) return null;
    return parsed;
  } catch {
    return null;
  }
}

function InventContent() {
  const searchParams = useSearchParams();
  const q = searchParams.get("q") ?? searchParams.get("prompt") ?? undefined;
  const specEncoded = searchParams.get("spec");
  const lockedSpec = parseLockedSpec(specEncoded);

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
        <UniversalCreatorFlow
          initialPrompt={lockedSpec ? undefined : q}
          initialLockedSpec={lockedSpec ?? undefined}
        />
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
