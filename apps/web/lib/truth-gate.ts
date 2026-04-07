/**
 * AI4U Little Engineer — Truth Gate
 *
 * The Truth Gate is the authoritative server-side function that validates every
 * generation request before any CAD job is created. It enforces the Truth Rules:
 *
 *   1. NEVER silently degrade — if a request cannot be fulfilled, say so clearly
 *   2. NEVER create a job that will silently fail
 *   3. NEVER show a success state without a real artifact
 *
 * Usage:
 *   import { runTruthGate } from "@/lib/truth-gate";
 *   const result = runTruthGate({ family, dimensions, confidence, missingFields });
 *   if (result.verdict !== "GO") {
 *     return NextResponse.json({ rejected: true, reason: result.reason, truth_label: result.truth_label }, { status: 422 });
 *   }
 *
 * The Truth Gate is synchronous and does NOT hit the database. It uses the
 * code-first capability registry from @ai4u/shared.
 */

import {
  getCapability,
  validateCapabilityDimensions,
  determineTruthLabel,
  type TruthLabel,
  type CapabilityEntry,
} from "@ai4u/shared";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface TruthGateInput {
  /** The part family selected by the LLM or intake engine */
  family: string | null | undefined;
  /** Dimensions extracted from the request */
  dimensions: Record<string, number>;
  /** LLM confidence score (0–1) */
  confidence: number;
  /** Fields identified as missing by the LLM */
  missing_fields?: string[];
  /** Whether this is a demo preset (bypasses some checks) */
  is_demo_preset?: boolean;
  /** Optional: rejection reason from the LLM itself */
  llm_rejection_reason?: string | null;
}

export type TruthGateVerdict = "GO" | "CLARIFY" | "CONCEPT_ONLY" | "REJECT";

export interface TruthGateResult {
  /** Final verdict */
  verdict: TruthGateVerdict;
  /** Truth label for this request */
  truth_label: TruthLabel;
  /** Human-readable explanation (shown to the user on non-GO verdicts) */
  reason: string | null;
  /** The capability entry if the family is supported */
  capability: CapabilityEntry | null;
  /** Dimension validation error if any */
  dimension_error: string | null;
  /** Which dimensions are missing */
  missing_dimensions: string[];
  /** Elapsed time in ms */
  elapsed_ms: number;
  /** ISO timestamp */
  timestamp: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Truth Gate
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runs the Truth Gate for a generation request.
 * Returns a TruthGateResult with a verdict and full audit trail.
 *
 * Verdict logic:
 *   REJECT       — family not in registry, or confidence < 0.5, or LLM rejected
 *   CLARIFY      — family is supported but dimensions are missing or confidence < 0.65
 *   CONCEPT_ONLY — family is experimental, or confidence < 0.85
 *   GO           — fully supported, all dimensions valid, confidence >= 0.85
 *
 * Demo presets (is_demo_preset=true) bypass confidence checks and go straight
 * to GO if the family is in the registry and dimensions are valid.
 */
export function runTruthGate(input: TruthGateInput): TruthGateResult {
  const startMs = Date.now();
  const timestamp = new Date().toISOString();

  const {
    family,
    dimensions,
    confidence,
    missing_fields = [],
    is_demo_preset = false,
    llm_rejection_reason,
  } = input;

  // ── Gate 1: LLM self-rejection ────────────────────────────────────────────
  if (llm_rejection_reason) {
    return {
      verdict: "REJECT",
      truth_label: "unsupported",
      reason: llm_rejection_reason,
      capability: null,
      dimension_error: null,
      missing_dimensions: [],
      elapsed_ms: Date.now() - startMs,
      timestamp,
    };
  }

  // ── Gate 2: Capability registry lookup ────────────────────────────────────
  const capability = family ? getCapability(family) : null;
  if (!capability) {
    const knownFamilies = [
      "spacer", "flat_bracket", "l_bracket", "u_bracket", "hole_plate",
      "standoff_block", "cable_clip", "enclosure", "adapter_bushing", "simple_jig",
    ];
    return {
      verdict: "REJECT",
      truth_label: "unsupported",
      reason:
        `"${family ?? "unknown"}" is not a supported part type. ` +
        `AI4U currently supports: ${knownFamilies.join(", ")}. ` +
        `Try describing a simpler mechanical need (e.g. "a bracket to mount my sensor").`,
      capability: null,
      dimension_error: null,
      missing_dimensions: [],
      elapsed_ms: Date.now() - startMs,
      timestamp,
    };
  }

  // ── Gate 3: Confidence check (skipped for demo presets) ───────────────────
  if (!is_demo_preset && confidence < 0.5) {
    return {
      verdict: "REJECT",
      truth_label: "unsupported",
      reason:
        `The AI was not confident enough to design this part (confidence: ${(confidence * 100).toFixed(0)}%). ` +
        `Try describing the problem more specifically — what does the part need to do, ` +
        `and what are the key dimensions?`,
      capability,
      dimension_error: null,
      missing_dimensions: missing_fields,
      elapsed_ms: Date.now() - startMs,
      timestamp,
    };
  }

  // ── Gate 4: Missing dimensions check ─────────────────────────────────────
  const missingDimensions = capability.required_dimensions
    .map((d) => d.name)
    .filter((name) => !(name in dimensions) || dimensions[name] === undefined);

  if (!is_demo_preset && missingDimensions.length > 0) {
    const strategy = capability.question_strategy;
    return {
      verdict: "CLARIFY",
      truth_label: "clarify_required",
      reason:
        `To generate a ${capability.label}, I need: ${missingDimensions.join(", ")}. ` +
        `${strategy.primary_question}`,
      capability,
      dimension_error: null,
      missing_dimensions: missingDimensions,
      elapsed_ms: Date.now() - startMs,
      timestamp,
    };
  }

  // ── Gate 5: Dimension validation ─────────────────────────────────────────
  const dimensionError = validateCapabilityDimensions(family!, dimensions);
  if (dimensionError) {
    return {
      verdict: "REJECT",
      truth_label: "unsupported",
      reason: dimensionError,
      capability,
      dimension_error: dimensionError,
      missing_dimensions: missingDimensions,
      elapsed_ms: Date.now() - startMs,
      timestamp,
    };
  }

  // ── Gate 6: Maturity check ────────────────────────────────────────────────
  if (!is_demo_preset && capability.maturity_level === "experimental") {
    return {
      verdict: "CONCEPT_ONLY",
      truth_label: "concept_preview",
      reason:
        `The ${capability.label} generator is experimental and cannot produce a printable STL yet. ` +
        `You can see a concept preview, but the design is not ready for printing.`,
      capability,
      dimension_error: null,
      missing_dimensions: [],
      elapsed_ms: Date.now() - startMs,
      timestamp,
    };
  }

  // ── Gate 7: Confidence-based concept preview ──────────────────────────────
  if (!is_demo_preset && confidence < 0.85) {
    const truthLabel = determineTruthLabel(family, confidence, missingDimensions.length > 0);
    if (truthLabel === "concept_preview") {
      return {
        verdict: "CONCEPT_ONLY",
        truth_label: "concept_preview",
        reason:
          `The AI has a partial design (confidence: ${(confidence * 100).toFixed(0)}%). ` +
          `This will generate a concept preview only — not a final printable file. ` +
          `Refine the description for a full STL.`,
        capability,
        dimension_error: null,
        missing_dimensions: [],
        elapsed_ms: Date.now() - startMs,
        timestamp,
      };
    }
  }

  // ── All gates passed — GO ─────────────────────────────────────────────────
  return {
    verdict: "GO",
    truth_label: "supported",
    reason: null,
    capability,
    dimension_error: null,
    missing_dimensions: [],
    elapsed_ms: Date.now() - startMs,
    timestamp,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Formats a TruthGateResult as a Daedalus Gate receipt object.
 * This is included in every API response for audit purposes.
 */
export function formatTruthGateReceipt(
  result: TruthGateResult,
  input: TruthGateInput
): Record<string, unknown> {
  return {
    gate: "truth_gate",
    timestamp: result.timestamp,
    elapsed_ms: result.elapsed_ms,
    verdict: result.verdict,
    truth_label: result.truth_label,
    family: input.family,
    confidence: input.confidence,
    is_demo_preset: input.is_demo_preset ?? false,
    capability_found: result.capability !== null,
    capability_maturity: result.capability?.maturity_level ?? null,
    dimension_error: result.dimension_error,
    missing_dimensions: result.missing_dimensions,
    reason: result.reason,
  };
}
