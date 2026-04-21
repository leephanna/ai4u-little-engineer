"use client";

/**
 * UniversalCreatorFlow
 *
 * The full orchestration component for the universal creation experience.
 * Manages the state machine:
 *   idle → interpreting → clarifying → previewing → generating → done
 *                       ↘ soft_match (new) → generating → done
 *                       ↘ ai_unsupported (new)
 *
 * Embeds:
 *   - UniversalInputComposer
 *   - LivePrintPlan
 *   - ClarificationChat
 *   - VisualPreviewPanel
 *   - SoftMatchPanel (NEW — AI router soft_match state)
 *   - AiUnsupportedPanel (NEW — AI router unsupported state)
 *
 * Locked spec path (gallery items):
 *   When initialLockedSpec is provided, the component skips the interpret
 *   step entirely and goes straight to "previewing" with the pre-built spec.
 *   No clarification, no missing dims, no LLM call.
 */

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import UniversalInputComposer, { type ComposerPayload } from "./UniversalInputComposer";
import LivePrintPlan from "./LivePrintPlan";
import ClarificationChat from "./ClarificationChat";
import VisualPreviewPanel from "./VisualPreviewPanel";
import { ClarifyFallbackForm } from "./ClarifyFallbackForm";
import { UnsupportedRequestPanel, type TruthVerdict } from "./UnsupportedRequestPanel";
import { SoftMatchPanel } from "./SoftMatchPanel";
import { AiUnsupportedPanel, type ExamplePrompt } from "./AiUnsupportedPanel";
import type { InterpretationResult } from "@/app/api/intake/interpret/route";

type FlowPhase =
  | "idle"
  | "interpreting"
  | "clarifying"
  | "previewing"
  | "generating"
  | "done"
  | "unsupported"
  | "soft_match"
  | "ai_unsupported";

interface TruthGateRejection {
  verdict: TruthVerdict;
  reason: string;
  truth_label?: string;
  missing_dimensions?: string[];
  confidence?: number;
}

interface SoftMatchState {
  family: string;
  parameters: Record<string, number>;
  explanation: string;
  confidence: number;
  missing_dims: string[];
  clarification_question: string | null;
}

interface AiUnsupportedState {
  explanation: string;
  suggestions: ExamplePrompt[];
}

interface LockedSpec {
  family: string;
  parameters: Record<string, number>;
  reasoning: string;
  confidence: number;
}

interface Props {
  printerName?: string;
  material?: string;
  examplePrompts?: string[];
  /** Pre-fill the input and auto-submit on mount (used by Gallery "Make This" via ?q= param) */
  initialPrompt?: string;
  /**
   * Locked complete spec payload (used by Gallery "Make This" via ?spec= param).
   * When provided, skips the interpret step entirely and goes straight to previewing.
   * No clarification, no missing dims, no LLM call.
   */
  initialLockedSpec?: LockedSpec;
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
  initialPrompt,
  initialLockedSpec,
}: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<FlowPhase>("idle");
  const [interpretation, setInterpretation] = useState<InterpretationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [fitEnvelope, setFitEnvelope] = useState<Record<string, number> | null>(null);
  const [showFallbackForm, setShowFallbackForm] = useState(false);
  const [truthGateRejection, setTruthGateRejection] = useState<TruthGateRejection | null>(null);
  const [softMatchState, setSoftMatchState] = useState<SoftMatchState | null>(null);
  const [aiUnsupportedState, setAiUnsupportedState] = useState<AiUnsupportedState | null>(null);
  const [prefilledPrompt, setPrefilledPrompt] = useState<string | undefined>(initialPrompt);

  // ── Locked spec fast-path ─────────────────────────────────────────────────
  useEffect(() => {
    if (initialLockedSpec && phase === "idle") {
      const syntheticResult: InterpretationResult = {
        mode: "parametric_part",
        family_candidate: initialLockedSpec.family,
        extracted_dimensions: initialLockedSpec.parameters,
        inferred_scale: null,
        inferred_object_type: null,
        missing_information: [],
        assistant_message: initialLockedSpec.reasoning,
        preview_strategy: "parametric_render",
        confidence: initialLockedSpec.confidence,
        file_interpretations: [],
        session_id: `locked-${Date.now()}`,
      };
      setInterpretation(syntheticResult);
      setPhase("previewing");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

      if (
        (result as InterpretationResult & { is_primitive?: boolean }).is_primitive ||
        result.mode !== "needs_clarification" && (result.missing_information?.length ?? 0) === 0
      ) {
        setPhase("previewing");
      } else if (result.mode === "needs_clarification" || (result.missing_information?.length ?? 0) > 0) {
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
    (updated: { updated_dimensions: Record<string, number>; updated_confidence: number; updated_mode: string; fit_envelope?: Record<string, number> | null; fallback_form?: boolean }) => {
      if (!interpretation) return;
      if (updated.fit_envelope) setFitEnvelope(updated.fit_envelope);
      if (updated.fallback_form) {
        setShowFallbackForm(true);
        return;
      }
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

  // ── Core generate function — shared by previewing and soft_match paths ────
  const doGenerate = useCallback(async (
    problemText: string,
    intakeFamilyCandidate: string | undefined,
    intakeDimensions: Record<string, number> | undefined,
    intakeSessionId: string | undefined,
    intakeMode: string | undefined,
  ) => {
    setPhase("generating");
    setError(null);

    try {
      const res = await fetch("/api/invent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problem: problemText,
          intake_session_id: intakeSessionId,
          intake_mode: intakeMode,
          intake_family_candidate: intakeFamilyCandidate,
          intake_dimensions: intakeDimensions,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        if (data.upgrade_required) {
          setError("Monthly limit reached. Please upgrade your plan to continue.");
          setPhase("previewing");
          return;
        }
        if (res.status === 422 && (data.verdict === "REJECT" || data.verdict === "CLARIFY")) {
          setTruthGateRejection({
            verdict: data.verdict as TruthVerdict,
            reason: data.reason ?? "This request could not be processed.",
            truth_label: data.truth_label,
            missing_dimensions: data.missing_dimensions,
            confidence: data.confidence,
          });
          setPhase("unsupported");
          return;
        }
        throw new Error("Generation failed");
      }

      const data = await res.json();

      // ── AI Router: soft_match response ──────────────────────────────────────
      if (data.status === "soft_match") {
        setSoftMatchState({
          family: data.family,
          parameters: data.parameters ?? {},
          explanation: data.explanation ?? "",
          confidence: data.confidence ?? 50,
          missing_dims: data.missing_dims ?? [],
          clarification_question: data.clarification_question ?? null,
        });
        setPhase("soft_match");
        return;
      }

      // ── AI Router: unsupported response ─────────────────────────────────────
      if (data.status === "unsupported") {
        setAiUnsupportedState({
          explanation: data.explanation ?? "This request could not be mapped to a supported part family.",
          suggestions: data.suggestions ?? [],
        });
        setPhase("ai_unsupported");
        return;
      }

      // ── Normal: job created ──────────────────────────────────────────────────
      setJobId(data.job_id);
      setPhase("done");
      setTimeout(() => {
        router.push(`/jobs/${data.job_id}`);
      }, 1500);
    } catch {
      setError("Generation failed. Please try again.");
      setPhase("previewing");
    }
  }, [router]);

  const handleConfirmGenerate = useCallback(async () => {
    if (!interpretation) return;

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

    await doGenerate(
      problemText,
      interpretation.family_candidate ?? undefined,
      interpretation.extracted_dimensions,
      interpretation.session_id,
      interpretation.mode,
    );
  }, [interpretation, fitEnvelope, doGenerate]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Soft match: user confirmed dims → generate ────────────────────────────
  const handleSoftMatchGenerate = useCallback(async (
    family: string,
    parameters: Record<string, number>
  ) => {
    const dimStr = Object.entries(parameters)
      .map(([k, v]) => `${k}=${v}mm`)
      .join(", ");
    const problemText = `Create a ${family.replace(/_/g, " ")} with dimensions: ${dimStr}`;

    await doGenerate(
      problemText,
      family,
      parameters,
      undefined,
      "parametric_part",
    );
  }, [doGenerate]);

  const handleReset = useCallback(() => {
    setPhase("idle");
    setInterpretation(null);
    setError(null);
    setJobId(null);
    setFitEnvelope(null);
    setShowFallbackForm(false);
    setTruthGateRejection(null);
    setSoftMatchState(null);
    setAiUnsupportedState(null);
    setPrefilledPrompt(undefined);
  }, []);

  // ── Try example prompt from AiUnsupportedPanel ────────────────────────────
  const handleTryExample = useCallback((prompt: string) => {
    setPhase("idle");
    setAiUnsupportedState(null);
    setError(null);
    setPrefilledPrompt(prompt);
  }, []);

  const handleFallbackConfirm = useCallback(async (values: { object_type: string; height_mm: string; width_mm: string; material: string; purpose: string; detail_level: string }) => {
    setPhase("generating");
    setError(null);
    setShowFallbackForm(false);

    const dims: Record<string, number> = {};
    if (values.height_mm) dims.height_mm = parseFloat(values.height_mm);
    if (values.width_mm) dims.width_mm = parseFloat(values.width_mm);

    const problemText = [
      `Create a ${values.object_type}`,
      Object.keys(dims).length > 0
        ? `with dimensions: ${Object.entries(dims).map(([k, v]) => `${k}=${v}mm`).join(", ")}`
        : "",
      `Material: ${values.material}. Purpose: ${values.purpose}. Quality: ${values.detail_level}.`,
    ].filter(Boolean).join(" ");

    await doGenerate(
      problemText,
      interpretation?.family_candidate ?? undefined,
      { ...interpretation?.extracted_dimensions, ...dims },
      interpretation?.session_id,
      interpretation?.mode ?? "parametric_part",
    );
  }, [interpretation, doGenerate]);

  return (
    <div className="space-y-4">
      {/* Locked spec banner */}
      {initialLockedSpec && phase !== "idle" && (
        <div className="rounded-lg bg-green-900/20 border border-green-700/50 px-4 py-3 text-sm text-green-300 flex items-center gap-2">
          <span>✓</span>
          <span>
            <strong>Gallery preset loaded</strong> — {initialLockedSpec.family.replace(/_/g, " ")} with complete spec.
            No clarification needed.
          </span>
        </div>
      )}

      {/* Input composer — idle and interpreting phases */}
      {(phase === "idle" || phase === "interpreting") && !initialLockedSpec && (
        <UniversalInputComposer
          onSubmit={handleComposerSubmit}
          isLoading={phase === "interpreting"}
          examplePrompts={examplePrompts}
          placeholder="Describe what you want to create, upload a photo or sketch, or use your voice…"
          submitLabel="Interpret →"
          initialValue={prefilledPrompt}
        />
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-900/30 border border-red-700 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Truth Gate rejection */}
      {phase === "unsupported" && truthGateRejection && (
        <UnsupportedRequestPanel
          verdict={truthGateRejection.verdict}
          reason={truthGateRejection.reason}
          truth_label={truthGateRejection.truth_label}
          missing_dimensions={truthGateRejection.missing_dimensions}
          confidence={truthGateRejection.confidence}
          onTryAgain={handleReset}
          onUseFallbackForm={truthGateRejection.verdict === "CLARIFY" ? () => {
            setPhase("clarifying");
            setShowFallbackForm(true);
            setTruthGateRejection(null);
          } : undefined}
        />
      )}

      {/* AI Router: soft_match state — "Best Match Found" */}
      {phase === "soft_match" && softMatchState && (
        <SoftMatchPanel
          family={softMatchState.family}
          parameters={softMatchState.parameters}
          explanation={softMatchState.explanation}
          confidence={softMatchState.confidence}
          missing_dims={softMatchState.missing_dims}
          clarification_question={softMatchState.clarification_question}
          onGenerate={handleSoftMatchGenerate}
          onReset={handleReset}
        />
      )}

      {/* AI Router: unsupported state — graceful dead-end */}
      {phase === "ai_unsupported" && aiUnsupportedState && (
        <AiUnsupportedPanel
          explanation={aiUnsupportedState.explanation}
          suggestions={aiUnsupportedState.suggestions}
          onTryExample={handleTryExample}
          onReset={handleReset}
        />
      )}

      {/* Live Print Plan */}
      {(phase === "clarifying" || phase === "previewing") && interpretation && (
        <LivePrintPlan result={interpretation} isLoading={false} />
      )}

      {/* Clarification chat */}
      {phase === "clarifying" && !showFallbackForm && interpretation?.assistant_message && (
        <ClarificationChat
          sessionId={interpretation.session_id}
          initialQuestion={interpretation.assistant_message}
          onReady={handleClarifyReady}
          onUpdate={handleClarifyUpdate}
        />
      )}

      {/* Fallback form */}
      {phase === "clarifying" && showFallbackForm && (
        <ClarifyFallbackForm
          sessionId={interpretation?.session_id ?? ""}
          existingDimensions={interpretation?.extracted_dimensions ?? {}}
          existingObjectType={interpretation?.inferred_object_type ?? ""}
          onConfirm={handleFallbackConfirm}
          onReset={handleReset}
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
