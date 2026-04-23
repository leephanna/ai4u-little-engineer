
/**
 * UniversalCreatorFlow
 *
 * The full orchestration component for the universal creation experience.
 *
 * State machine:
 *   idle → routing (calls /api/invent directly)
 *        ↘ soft_match      → SoftMatchPanel (editable dims + optional inline question)
 *        ↘ ai_unsupported  → AiUnsupportedPanel (graceful dead-end)
 *        ↘ custom_preview  → CustomPreviewPanel (LLM CadQuery result + refinement loop)
 *        ↘ generating      → (job created by direct_match or SoftMatchPanel confirm)
 *        ↘ done            → redirect to /jobs/[id]
 *        ↘ clarifying      → ClarificationChat (fallback: no family identified)
 *        ↘ previewing      → VisualPreviewPanel (fallback: interpret-based flow)
 *        ↘ unsupported     → UnsupportedRequestPanel (Truth Gate rejection)
 *
 * IMPORTANT: The primary path is now:
 *   1. User submits text → POST /api/invent
 *   2. /api/invent runs normalizer fast-path, then AI router
 *   3. AI router returns direct_match → job created immediately
 *   4. AI router returns soft_match → SoftMatchPanel shown
 *   5. AI router returns custom_generate → CAD worker called → CustomPreviewPanel shown
 *   6. AI router returns unsupported → AiUnsupportedPanel shown
 *   7. AI router unavailable → fall back to /api/intake/interpret → clarify/preview
 *
 * The old interpret → clarify → preview path is preserved as a fallback
 * for when the AI router is unavailable or returns null.
 *
 * Locked spec path (gallery items):
 *   When initialLockedSpec is provided, the component skips all steps
 *   and goes straight to "previewing" with the pre-built spec.
 */

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import UniversalInputComposer, { type ComposerPayload } from "./UniversalInputComposer";
import LivePrintPlan from "./LivePrintPlan";
import ClarificationChat from "./ClarificationChat";
import VisualPreviewPanel from "./VisualPreviewPanel";
import { ClarifyFallbackForm } from "./ClarifyFallbackForm";
import { UnsupportedRequestPanel, type TruthVerdict } from "./UnsupportedRequestPanel";
import { SoftMatchPanel } from "./SoftMatchPanel";
import { AiUnsupportedPanel, type ExamplePrompt } from "./AiUnsupportedPanel";
import type { InterpretationResult } from "@/app/api/intake/interpret/route";

// Lazy-load the heavy Three.js viewer — same pattern as JobPreviewPanel
const StlViewer = dynamic(
  () => import("@/components/StlViewer").then((m) => ({ default: m.StlViewer })),
  {
    ssr: false,
    loading: () => (
      <div className="w-full aspect-video max-h-72 bg-steel-900 rounded-xl animate-pulse flex items-center justify-center">
        <p className="text-steel-600 text-xs">Loading 3D viewer…</p>
      </div>
    ),
  }
);

type FlowPhase =
  | "idle"
  | "routing"        // NEW: primary path — waiting for /api/invent response
  | "interpreting"   // FALLBACK: waiting for /api/intake/interpret response
  | "clarifying"     // FALLBACK: no family identified, show chat
  | "previewing"     // FALLBACK: interpret-based preview
  | "generating"
  | "done"
  | "unsupported"    // Truth Gate rejection
  | "soft_match"     // AI Router: soft_match state
  | "ai_unsupported" // AI Router: unsupported state
  | "custom_preview" // AI Router: custom_generate — LLM CadQuery result
  | "custom_refining"; // Refinement in progress

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

interface CustomPreviewState {
  job_id: string;
  artifact_id: string | null;
  storage_path: string | null;
  generated_code: string | null;
  plain_english_summary: string | null;
  original_description: string;
  cad_run_id: string | null;
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
   * When provided, skips all steps and goes straight to previewing.
   */
  initialLockedSpec?: LockedSpec;
  /**
   * Custom-generate fast-path description (used by Gallery "Make This" via ?custom_generate=true param).
   * When provided, bypasses the AI router entirely and calls /generate-custom on the CAD worker directly.
   */
  initialCustomDescription?: string;
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
  initialCustomDescription,
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
  const [customPreviewState, setCustomPreviewState] = useState<CustomPreviewState | null>(null);
  const [refinementInput, setRefinementInput] = useState("");
  const [prefilledPrompt, setPrefilledPrompt] = useState<string | undefined>(initialPrompt);
  // Track the last submitted text so we can pass it to the fallback interpret path
  const [lastSubmittedText, setLastSubmittedText] = useState<string>("");
  // Signed URL for the inline 3D viewer in custom_preview panel
  const [customStlSignedUrl, setCustomStlSignedUrl] = useState<string | null>(null);

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

  // ── Custom-generate fast-path (gallery items with custom_generate=true) ────
  // Bypasses the AI router entirely. Calls /api/invent with custom_generate: true
  // so it goes straight to handleCustomGenerate → CAD worker /generate-custom.
  useEffect(() => {
    if (initialCustomDescription && phase === "idle") {
      setPhase("routing");
      setError(null);
      setLastSubmittedText(initialCustomDescription);

      fetch("/api/invent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problem: initialCustomDescription,
          custom_generate: true,
          custom_description: initialCustomDescription,
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.status === "custom_generate_ready") {
            setCustomPreviewState({
              job_id: data.job_id,
              artifact_id: data.artifact_id ?? null,
              storage_path: data.storage_path ?? null,
              generated_code: data.generated_code ?? null,
              plain_english_summary: data.plain_english_summary ?? null,
              original_description: initialCustomDescription,
              cad_run_id: data.cad_run_id ?? null,
            });
            setPhase("custom_preview");
          } else if (data.status === "custom_generate_failed") {
            setError(
              data.error
                ? `Custom shape couldn't be generated — ${data.error}`
                : "Custom shape couldn't be generated — try describing it differently."
            );
            setPhase("idle");
          } else {
            setError("Unexpected response from custom generation. Please try again.");
            setPhase("idle");
          }
        })
        .catch(() => {
          setError("Custom generation request failed. Please try again.");
          setPhase("idle");
        });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── PRIMARY PATH: Submit directly to /api/invent ─────────────────────────
  // This is the new primary flow. The AI router inside /api/invent handles
  // direct_match, soft_match, custom_generate, and unsupported outcomes.
  // If the AI router is unavailable, we fall back to the interpret path.
  const handleComposerSubmit = useCallback(async (payload: ComposerPayload) => {
    const inputText = (payload.text ?? "").trim();
    setLastSubmittedText(inputText);
    setPhase("routing");
    setError(null);

    // If there are file attachments, fall back to the interpret path
    // (the AI router doesn't handle file uploads)
    if (payload.files && payload.files.length > 0) {
      await handleInterpretFallback(payload);
      return;
    }

    try {
      const res = await fetch("/api/invent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problem: inputText,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));

        // Truth Gate rejection (422)
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

        // Auth error — fall back to interpret path
        if (res.status === 401) {
          await handleInterpretFallback(payload);
          return;
        }

        throw new Error("Routing failed");
      }

      const data = await res.json();

      // ── AI Router: soft_match → show SoftMatchPanel ──────────────────────
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

      // ── AI Router: custom_generate ready → show CustomPreviewPanel ────────
      if (data.status === "custom_generate_ready") {
        setCustomPreviewState({
          job_id: data.job_id,
          artifact_id: data.artifact_id ?? null,
          storage_path: data.storage_path ?? null,
          generated_code: data.generated_code ?? null,
          plain_english_summary: data.plain_english_summary ?? null,
          original_description: inputText,
          cad_run_id: data.cad_run_id ?? null,
        });
        setPhase("custom_preview");
        return;
      }

      // ── AI Router: custom_generate failed ────────────────────────────────
      if (data.status === "custom_generate_failed") {
        setError(
          data.error
            ? `Custom shape couldn't be generated — ${data.error}`
            : "Custom shape couldn't be generated — try describing it differently."
        );
        setPhase("idle");
        return;
      }

      // ── AI Router: unsupported → show AiUnsupportedPanel ─────────────────
      if (data.status === "unsupported") {
        setAiUnsupportedState({
          explanation: data.explanation ?? "This request could not be mapped to a supported part family.",
          suggestions: data.suggestions ?? [],
        });
        setPhase("ai_unsupported");
        return;
      }

      // ── AI Router: direct_match → job created ────────────────────────────
      if (data.job_id) {
        setJobId(data.job_id);
        setPhase("done");
        setTimeout(() => {
          router.push(`/jobs/${data.job_id}`);
        }, 1500);
        return;
      }

      // ── Fallback: unexpected response → interpret path ───────────────────
      await handleInterpretFallback(payload);
    } catch {
      // On any error, fall back to the interpret path
      await handleInterpretFallback(payload);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // ── FALLBACK PATH: /api/intake/interpret → clarify/preview ───────────────
  // Used when: file uploads, auth errors, or AI router unavailable
  const handleInterpretFallback = useCallback(async (payload: ComposerPayload) => {
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

  // ── Core generate function — used by previewing and soft_match paths ──────
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
        ? `with dimensions: ${Object.entries(interpretation.extracted_dimensions ?? {})
            .map(([k, v]) => `${k}=${v}mm`)
            .join(", ")}`
        : "",
      fitEnvelope
        ? `fit envelope: ${Object.entries(fitEnvelope)
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
  }, [interpretation, fitEnvelope, doGenerate]);

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

  // ── Fetch signed URL for custom STL viewer when entering custom_preview ────
  useEffect(() => {
    if (phase === "custom_preview" && customPreviewState?.job_id) {
      setCustomStlSignedUrl(null);
      fetch(`/api/artifacts/signed-url?job_id=${encodeURIComponent(customPreviewState.job_id)}`)
        .then((r) => r.json())
        .then((data: { signed_url?: string; artifact_id?: string }) => {
          if (data.signed_url) {
            setCustomStlSignedUrl(data.signed_url);
          }
          // Also capture artifact_id if not already set
          if (data.artifact_id && customPreviewState && !customPreviewState.artifact_id) {
            setCustomPreviewState((prev) =>
              prev ? { ...prev, artifact_id: data.artifact_id ?? null } : prev
            );
          }
        })
        .catch(() => {
          // Viewer will fall back to download route
        });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, customPreviewState?.job_id]);

  // ── Custom preview: approve → redirect to job page ────────────────────────
  const handleCustomApprove = useCallback(() => {
    if (!customPreviewState?.job_id) return;
    setJobId(customPreviewState.job_id);
    setPhase("done");
    setTimeout(() => {
      router.push(`/jobs/${customPreviewState.job_id}`);
    }, 1000);
  }, [customPreviewState, router]);

  // ── Custom preview: refine → send previous_code + instruction ─────────────
  const handleCustomRefine = useCallback(async () => {
    if (!customPreviewState || !refinementInput.trim()) return;

    setPhase("custom_refining");
    setError(null);

    try {
      const res = await fetch("/api/invent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: customPreviewState.original_description,
          custom_generate: true,
          custom_description: customPreviewState.original_description,
          previous_code: customPreviewState.generated_code,
          refinement_instruction: refinementInput.trim(),
        }),
      });

      const data = await res.json();

      if (data.status === "custom_generate_ready") {
        setCustomPreviewState({
          job_id: data.job_id,
          artifact_id: data.artifact_id ?? null,
          storage_path: data.storage_path ?? null,
          generated_code: data.generated_code ?? null,
          plain_english_summary: data.plain_english_summary ?? null,
          original_description: customPreviewState.original_description,
          cad_run_id: data.cad_run_id ?? null,
        });
        setRefinementInput("");
        setCustomStlSignedUrl(null);
        setPhase("custom_preview");
        return;
      }

      if (data.status === "custom_generate_failed") {
        setError(data.error ?? "Custom shape couldn't be generated — try describing it differently.");
        setPhase("custom_preview");
        return;
      }

      setError("Unexpected response from refinement. Please try again.");
      setPhase("custom_preview");
    } catch {
      setError("Refinement failed. Please try again.");
      setPhase("custom_preview");
    }
  }, [customPreviewState, refinementInput]);

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
    setCustomPreviewState(null);
    setRefinementInput("");
    setPrefilledPrompt(undefined);
    setLastSubmittedText("");
  }, []);

  // ── Try example prompt from AiUnsupportedPanel ────────────────────────────
  const handleTryExample = useCallback((prompt: string) => {
    setPhase("idle");
    setAiUnsupportedState(null);
    setError(null);
    setPrefilledPrompt(prompt);
  }, []);

  // ── Custom generate from AiUnsupportedPanel or SoftMatchPanel ────────────
  // Called when user clicks "Generate with LLM →" from either panel.
  // Uses the last submitted text as the custom_description.
  const handleCustomGenerateEscape = useCallback(async () => {
    const desc = lastSubmittedText.trim();
    if (!desc) return;

    setAiUnsupportedState(null);
    setSoftMatchState(null);
    setPhase("routing");
    setError(null);

    try {
      const res = await fetch("/api/invent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problem: desc,
          custom_generate: true,
          custom_description: desc,
        }),
      });
      const data = await res.json() as {
        status: string;
        job_id?: string;
        artifact_id?: string;
        storage_path?: string;
        generated_code?: string;
        plain_english_summary?: string;
        cad_run_id?: string;
        error?: string;
      };

      if (data.status === "custom_generate_ready") {
        setCustomPreviewState({
          job_id: data.job_id ?? "",
          artifact_id: data.artifact_id ?? null,
          storage_path: data.storage_path ?? null,
          generated_code: data.generated_code ?? null,
          plain_english_summary: data.plain_english_summary ?? null,
          original_description: desc,
          cad_run_id: data.cad_run_id ?? null,
        });
        setPhase("custom_preview");
      } else if (data.status === "custom_generate_failed") {
        setError(
          data.error
            ? `Custom shape couldn't be generated — ${data.error}`
            : "Custom shape couldn't be generated — try describing it differently."
        );
        setPhase("idle");
      } else {
        setError("Unexpected response. Please try again.");
        setPhase("idle");
      }
    } catch {
      setError("Custom generation failed. Please try again.");
      setPhase("idle");
    }
  }, [lastSubmittedText]);

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

  // Whether the input composer should be shown
  const showComposer = (phase === "idle" || phase === "routing" || phase === "interpreting") && !initialLockedSpec;

  // Whether the clarify_required banner should be suppressed:
  // Suppress when the AI router has already identified a family (soft_match state)
  // or when we're in the fallback clarify path with a known family candidate
  const familyIsKnown =
    phase === "soft_match" ||
    (phase === "clarifying" && interpretation?.family_candidate != null && interpretation.family_candidate !== "");

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

      {/* Input composer — idle, routing, and interpreting phases */}
      {showComposer && (
        <UniversalInputComposer
          onSubmit={handleComposerSubmit}
          isLoading={phase === "routing" || phase === "interpreting"}
          examplePrompts={examplePrompts}
          placeholder="Describe what you want to create, upload a photo or sketch, or use your voice…"
          submitLabel={phase === "routing" || phase === "interpreting" ? "Thinking…" : "Create →"}
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
          onCustomGenerate={handleCustomGenerateEscape}
        />
      )}

      {/* AI Router: unsupported state — graceful dead-end */}
      {phase === "ai_unsupported" && aiUnsupportedState && (
        <AiUnsupportedPanel
          explanation={aiUnsupportedState.explanation}
          suggestions={aiUnsupportedState.suggestions}
          onTryExample={handleTryExample}
          onReset={handleReset}
          onCustomGenerate={handleCustomGenerateEscape}
          originalDescription={lastSubmittedText}
        />
      )}

      {/* Custom preview panel — LLM CadQuery result with refinement loop */}
      {(phase === "custom_preview" || phase === "custom_refining") && customPreviewState && (
        <div className="rounded-xl border border-brand-600/50 bg-steel-800/60 overflow-hidden">
          {/* Header */}
          <div className="px-5 py-4 border-b border-steel-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-brand-400 text-lg">✦</span>
              <span className="text-steel-100 font-semibold text-sm">Custom Shape Generated</span>
            </div>
            <span className="text-xs text-steel-500 font-mono bg-steel-900/60 px-2 py-0.5 rounded">
              CadQuery
            </span>
          </div>

          {/* Summary */}
          {customPreviewState.plain_english_summary && (
            <div className="px-5 py-4 border-b border-steel-700/50">
              <p className="text-sm text-steel-200 leading-relaxed">
                {customPreviewState.plain_english_summary}
              </p>
            </div>
          )}

          {/* Inline 3D viewer — same experience as parametric jobs (Track 1) */}
          {customPreviewState.storage_path && (
            <div className="border-b border-steel-700/50">
              {customStlSignedUrl ? (
                <div className="space-y-2 px-5 py-4">
                  <div className="rounded-xl overflow-hidden bg-steel-900 border border-steel-800">
                    <StlViewer
                      url={customStlSignedUrl}
                      width={600}
                      height={360}
                      className="w-full"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 text-xs bg-indigo-900/30 text-indigo-300 border border-indigo-800 rounded px-2 py-0.5">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                      </svg>
                      3D Preview
                    </span>
                    <span className="text-xs text-steel-600">Click · drag · scroll to explore</span>
                    {customPreviewState.artifact_id && (
                      <a
                        href={`/api/artifacts/${customPreviewState.artifact_id}/download`}
                        className="text-xs bg-brand-600 hover:bg-brand-500 text-white px-3 py-1.5 rounded-md transition-colors font-medium"
                        download
                      >
                        Download STL
                      </a>
                    )}
                  </div>
                </div>
              ) : (
                // Viewer loading or signed URL not yet available — show STL badge + download
                <div className="px-5 py-4">
                  <div className="rounded-lg bg-steel-900/50 border border-steel-700 p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-brand-600/20 flex items-center justify-center text-brand-400 text-sm font-bold">
                        STL
                      </div>
                      <div>
                        <div className="text-sm text-steel-200 font-medium">custom_shape.stl</div>
                        <div className="text-xs text-steel-500">
                          {customPreviewState.artifact_id ? "Loading 3D viewer…" : "Ready for 3D printing"}
                        </div>
                      </div>
                    </div>
                    {customPreviewState.artifact_id && (
                      <a
                        href={`/api/artifacts/${customPreviewState.artifact_id}/download`}
                        className="text-xs bg-brand-600 hover:bg-brand-500 text-white px-3 py-1.5 rounded-md transition-colors font-medium"
                        download
                      >
                        Download STL
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Generated code (collapsible) */}
          {customPreviewState.generated_code && (
            <details className="border-b border-steel-700/50">
              <summary className="px-5 py-3 text-xs text-steel-400 cursor-pointer hover:text-steel-300 transition-colors select-none">
                View generated CadQuery code
              </summary>
              <pre className="px-5 pb-4 text-xs text-steel-300 font-mono overflow-x-auto bg-steel-900/30 leading-relaxed">
                {customPreviewState.generated_code}
              </pre>
            </details>
          )}

          {/* Refinement input */}
          <div className="px-5 py-4">
            <p className="text-xs text-steel-400 mb-3 font-medium">
              Not quite right? Describe what to change:
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={refinementInput}
                onChange={(e) => setRefinementInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && refinementInput.trim() && phase !== "custom_refining") {
                    void handleCustomRefine();
                  }
                }}
                placeholder="e.g. make it 20% taller, add a hole in the center, round the corners…"
                disabled={phase === "custom_refining"}
                className="flex-1 bg-steel-900/60 border border-steel-600 rounded-lg px-3 py-2 text-sm text-steel-200 placeholder-steel-600 focus:outline-none focus:border-brand-500 disabled:opacity-50"
              />
              <button
                onClick={() => void handleCustomRefine()}
                disabled={!refinementInput.trim() || phase === "custom_refining"}
                className="bg-steel-700 hover:bg-steel-600 disabled:opacity-40 disabled:cursor-not-allowed text-steel-200 text-sm px-4 py-2 rounded-lg transition-colors font-medium whitespace-nowrap"
              >
                {phase === "custom_refining" ? (
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 border border-steel-400 border-t-transparent rounded-full animate-spin" />
                    Refining…
                  </span>
                ) : (
                  "Refine →"
                )}
              </button>
            </div>
          </div>

          {/* Action buttons */}
          <div className="px-5 pb-5 flex items-center gap-3">
            <button
              onClick={handleCustomApprove}
              disabled={phase === "custom_refining"}
              className="flex-1 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
            >
              ✓ Approve &amp; Download
            </button>
            <button
              onClick={handleReset}
              disabled={phase === "custom_refining"}
              className="text-sm text-steel-500 hover:text-steel-300 transition-colors disabled:opacity-40"
            >
              Start over
            </button>
          </div>
        </div>
      )}

      {/* Live Print Plan (fallback clarify/preview path) */}
      {(phase === "clarifying" || phase === "previewing") && interpretation && (
        <LivePrintPlan result={interpretation} isLoading={false} />
      )}

      {/* Clarification chat — ONLY shown when family is NOT known */}
      {phase === "clarifying" && !showFallbackForm && interpretation?.assistant_message && !familyIsKnown && (
        <ClarificationChat
          sessionId={interpretation.session_id}
          initialQuestion={interpretation.assistant_message}
          onReady={handleClarifyReady}
          onUpdate={handleClarifyUpdate}
        />
      )}

      {/* Clarification chat — shown when family IS known (no banner, just chat) */}
      {phase === "clarifying" && !showFallbackForm && interpretation?.assistant_message && familyIsKnown && (
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
