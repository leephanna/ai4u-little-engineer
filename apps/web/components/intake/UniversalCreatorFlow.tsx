"use client";

/**
 * UniversalCreatorFlow
 *
 * The full orchestration component for the universal creation experience.
 * Manages the state machine:
 *   idle → interpreting → clarifying → previewing → generating → done
 *
 * Embeds:
 *   - UniversalInputComposer
 *   - LivePrintPlan
 *   - ClarificationChat
 *   - VisualPreviewPanel
 */

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import UniversalInputComposer, { type ComposerPayload } from "./UniversalInputComposer";
import LivePrintPlan from "./LivePrintPlan";
import ClarificationChat from "./ClarificationChat";
import VisualPreviewPanel from "./VisualPreviewPanel";
import type { InterpretationResult } from "@/app/api/intake/interpret/route";

type FlowPhase = "idle" | "interpreting" | "clarifying" | "previewing" | "generating" | "done";

interface Props {
  printerName?: string;
  material?: string;
  examplePrompts?: string[];
}

const CONSUMER_EXAMPLES = [
  "Make a small replica of the PNG I uploaded",
  "Turn my kid's sketch into a desk model",
  "Make a custom wall sign from this SVG",
  "Build a cable holder for my desk",
  "I need a bracket to hold my monitor arm",
];

export default function UniversalCreatorFlow({
  printerName,
  material = "PLA",
  examplePrompts = CONSUMER_EXAMPLES,
}: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<FlowPhase>("idle");
  const [interpretation, setInterpretation] = useState<InterpretationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  const handleComposerSubmit = useCallback(async (payload: ComposerPayload) => {
    setPhase("interpreting");
    setError(null);

    try {
      const res = await fetch("/api/intake/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: payload.text,
          files: payload.files,
          voice_transcript: payload.voiceTranscript,
        }),
      });

      if (!res.ok) throw new Error("Interpretation failed");

      const result: InterpretationResult = await res.json();
      setInterpretation(result);

      if (result.mode === "needs_clarification" || (result.missing_information?.length ?? 0) > 0) {
        setPhase("clarifying");
      } else {
        setPhase("previewing");
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setPhase("idle");
    }
  }, []);

  const handleClarifyReady = useCallback(() => {
    setPhase("previewing");
  }, []);

  const handleClarifyUpdate = useCallback(
    (updated: { updated_dimensions: Record<string, number>; updated_confidence: number; updated_mode: string }) => {
      if (!interpretation) return;
      setInterpretation((prev) =>
        prev
          ? {
              ...prev,
              extracted_dimensions: {
                ...prev.extracted_dimensions,
                ...updated.updated_dimensions,
              },
              confidence: updated.updated_confidence,
              mode: updated.updated_mode as InterpretationResult["mode"],
            }
          : prev
      );
    },
    [interpretation]
  );

  const handleConfirmGenerate = useCallback(async () => {
    if (!interpretation) return;
    setPhase("generating");
    setError(null);

    try {
      // Build a problem text from the interpretation for the existing /api/invent route
      const problemText = [
        interpretation.inferred_object_type
          ? `Create a ${interpretation.inferred_object_type}`
          : "Create a 3D printable design",
        interpretation.inferred_scale ? `(${interpretation.inferred_scale})` : "",
        Object.keys(interpretation.extracted_dimensions ?? {}).length > 0
          ? `with dimensions: ${Object.entries(interpretation.extracted_dimensions)
              .map(([k, v]) => `${k}=${v}mm`)
              .join(", ")}`
          : "",
      ]
        .filter(Boolean)
        .join(" ");

      const res = await fetch("/api/invent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problem: problemText,
          intake_session_id: interpretation.session_id,
          intake_mode: interpretation.mode,
          intake_family_candidate: interpretation.family_candidate,
          intake_dimensions: interpretation.extracted_dimensions,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        if (data.upgrade_required) {
          setError("Monthly limit reached. Please upgrade your plan to continue.");
          setPhase("previewing");
          return;
        }
        throw new Error("Generation failed");
      }

      const data = await res.json();
      setJobId(data.job_id);
      setPhase("done");

      // Redirect to job page after a brief moment
      setTimeout(() => {
        router.push(`/jobs/${data.job_id}`);
      }, 1500);
    } catch {
      setError("Generation failed. Please try again.");
      setPhase("previewing");
    }
  }, [interpretation, router]);

  const handleReset = useCallback(() => {
    setPhase("idle");
    setInterpretation(null);
    setError(null);
    setJobId(null);
  }, []);

  return (
    <div className="space-y-4">
      {/* Input composer — always visible in idle phase */}
      {(phase === "idle" || phase === "interpreting") && (
        <UniversalInputComposer
          onSubmit={handleComposerSubmit}
          isLoading={phase === "interpreting"}
          examplePrompts={examplePrompts}
          placeholder="Describe what you want to create, upload a photo or sketch, or use your voice…"
          submitLabel="Interpret →"
        />
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-900/30 border border-red-700 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Live Print Plan — shown during and after interpretation */}
      {(phase === "clarifying" || phase === "previewing") && interpretation && (
        <LivePrintPlan result={interpretation} isLoading={false} />
      )}

      {/* Clarification chat */}
      {phase === "clarifying" && interpretation?.assistant_message && (
        <ClarificationChat
          sessionId={interpretation.session_id}
          initialQuestion={interpretation.assistant_message}
          onReady={handleClarifyReady}
          onUpdate={handleClarifyUpdate}
        />
      )}

      {/* Visual preview */}
      {phase === "previewing" && interpretation && (
        <VisualPreviewPanel
          result={interpretation}
          printerName={printerName}
          material={material}
          onConfirm={handleConfirmGenerate}
          onEdit={handleReset}
          isGenerating={false}
        />
      )}

      {/* Generating state */}
      {phase === "generating" && (
        <div className="rounded-xl border border-steel-700 bg-steel-800/50 p-8 text-center">
          <div className="inline-flex items-center gap-3 mb-3">
            <div className="w-6 h-6 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-steel-200 font-medium">Generating your design…</span>
          </div>
          <p className="text-sm text-steel-500">
            The CAD engine is building your STL and STEP files. This usually takes 15–60 seconds.
          </p>
        </div>
      )}

      {/* Done state */}
      {phase === "done" && jobId && (
        <div className="rounded-xl border border-green-700 bg-green-900/20 p-6 text-center">
          <div className="text-3xl mb-2">✅</div>
          <div className="text-steel-200 font-semibold mb-1">Design generated!</div>
          <p className="text-sm text-steel-400">Redirecting to your result page…</p>
        </div>
      )}

      {/* Edit / start over link */}
      {(phase === "clarifying" || phase === "previewing") && (
        <button
          onClick={handleReset}
          className="text-xs text-steel-500 hover:text-steel-300 transition-colors"
        >
          ← Start over
        </button>
      )}
    </div>
  );
}
