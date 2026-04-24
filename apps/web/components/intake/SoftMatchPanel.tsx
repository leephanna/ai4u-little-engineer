"use client";

/**
 * SoftMatchPanel
 *
 * Shown when the AI Router returns outcome = "soft_match":
 *   - confidence ≥ 50 but < 75, OR
 *   - confidence ≥ 75 but missing_dims present
 *
 * Displays:
 *   - "Best Match Found" header with confidence badge pill
 *   - Family name + AI explanation sentence
 *   - Inline clarification question with answer field (if any)
 *   - All inferred dimensions as editable number fields
 *     (missing dims highlighted in amber)
 *   - "Generate with these dimensions" (primary)
 *   - "Generate with LLM instead" (escape hatch for complex shapes)
 *   - "Describe differently" (secondary — resets)
 *
 * The user can edit any dimension value before generating.
 * Missing dims show an amber "(required)" label and an empty placeholder.
 * The Generate button is disabled until all required (missing) dims are filled.
 */

import React, { useState } from "react";

export interface SoftMatchPanelProps {
  family: string;
  parameters: Record<string, number>;
  explanation: string;
  confidence: number;
  missing_dims: string[];
  clarification_question: string | null;
  onGenerate: (family: string, parameters: Record<string, number>) => void;
  onReset: () => void;
  /** Called when user wants to bypass parametric and use LLM CadQuery instead */
  onCustomGenerate?: () => void;
}

function formatFamilyName(family: string): string {
  return family
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function formatDimLabel(key: string): string {
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function SoftMatchPanel({
  family,
  parameters,
  explanation,
  confidence,
  missing_dims,
  clarification_question,
  onGenerate,
  onReset,
  onCustomGenerate,
}: SoftMatchPanelProps) {
  // Editable dimension state — pre-filled with AI-inferred values
  const [dims, setDims] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const [k, v] of Object.entries(parameters)) {
      initial[k] = String(v);
    }
    // Add empty fields for missing dims
    for (const dim of missing_dims) {
      if (!(dim in initial)) initial[dim] = "";
    }
    return initial;
  });

  // Optional inline answer to the clarification question
  const [clarificationAnswer, setClarificationAnswer] = useState("");

  const confidencePct = Math.round(Math.min(100, Math.max(0, confidence)));

  const confidenceColor =
    confidencePct >= 75
      ? "bg-green-500"
      : confidencePct >= 50
      ? "bg-amber-400"
      : "bg-red-400";

  const confidenceBadgeColor =
    confidencePct >= 75
      ? "bg-green-900/40 text-green-300 border-green-700/50"
      : confidencePct >= 50
      ? "bg-amber-900/40 text-amber-300 border-amber-700/50"
      : "bg-red-900/40 text-red-300 border-red-700/50";

  const confidenceLabel =
    confidencePct >= 75 ? "High confidence" : confidencePct >= 50 ? "Good match" : "Low confidence";

  const handleChange = (key: string, value: string) => {
    setDims((prev) => ({ ...prev, [key]: value }));
  };

  // All required missing dims must be filled before generating
  const missingUnfilled = missing_dims.filter((d) => {
    const v = dims[d];
    return !v || isNaN(parseFloat(v)) || parseFloat(v) <= 0;
  });
  const canGenerate = missingUnfilled.length === 0;

  const handleGenerate = () => {
    if (!canGenerate) return;
    // Parse all dims to numbers; skip empty/invalid
    const parsed: Record<string, number> = {};
    for (const [k, v] of Object.entries(dims)) {
      const n = parseFloat(v);
      if (!isNaN(n) && n > 0) parsed[k] = n;
    }
    onGenerate(family, parsed);
  };

  const allDimKeys = [
    ...Object.keys(parameters),
    ...missing_dims.filter((d) => !(d in parameters)),
  ];

  // Show the LLM escape hatch whenever onCustomGenerate is provided.
  // Previously gated on confidence < 75, but this meant the button was hidden
  // for high-confidence matches (e.g. cable_clip at 80%), making it unreachable.
  // Users should always have the option to use LLM generation from soft_match.
  const showLlmEscapeHatch = !!onCustomGenerate;

  return (
    <div className="rounded-xl border border-brand-600/50 bg-steel-800/60 p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex-shrink-0 w-8 h-8 rounded-full bg-brand-900/60 border border-brand-600/50 flex items-center justify-center">
          <span className="text-brand-400 text-base" aria-hidden="true">✦</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-steel-100 text-base">Best Match Found</h3>
            {/* Confidence badge pill */}
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${confidenceBadgeColor}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${confidenceColor}`} />
              {confidenceLabel} · {confidencePct}%
            </span>
          </div>
          <p className="text-sm text-steel-400 mt-0.5">
            Closest part family:{" "}
            <span className="text-brand-300 font-medium">{formatFamilyName(family)}</span>
          </p>
        </div>
      </div>

      {/* AI explanation */}
      <p className="text-sm text-steel-300 leading-relaxed italic border-l-2 border-brand-600/40 pl-3">
        {explanation}
      </p>

      {/* Confidence bar */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-steel-500 w-20 shrink-0">Confidence</span>
        <div className="flex-1 h-1.5 rounded-full bg-steel-700">
          <div
            className={`h-1.5 rounded-full transition-all ${confidenceColor}`}
            style={{ width: `${confidencePct}%` }}
          />
        </div>
        <span className="text-xs text-steel-400 w-10 text-right">{confidencePct}%</span>
      </div>

      {/* LLM escape hatch — shown when confidence is low */}
      {showLlmEscapeHatch && (
        <div className="rounded-lg bg-indigo-900/20 border border-indigo-700/40 px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-xs text-indigo-300">
            <span className="font-semibold">Not a perfect fit?</span>{" "}
            Our LLM CadQuery engine can generate a more accurate custom shape.
          </p>
          <button
            onClick={onCustomGenerate}
            className="shrink-0 text-xs px-3 py-1.5 rounded-md bg-indigo-700 hover:bg-indigo-600 text-white font-medium transition-colors whitespace-nowrap"
          >
            Generate with LLM →
          </button>
        </div>
      )}

      {/* Inline clarification question */}
      {clarification_question && (
        <div className="rounded-lg bg-amber-900/20 border border-amber-700/40 px-4 py-3 space-y-2">
          <p className="text-sm text-amber-300">
            <span className="font-semibold">One question: </span>
            {clarification_question}
          </p>
          <input
            type="text"
            value={clarificationAnswer}
            onChange={(e) => setClarificationAnswer(e.target.value)}
            placeholder="Your answer (optional — dimensions below will be used regardless)"
            className="w-full rounded-md bg-steel-700/80 border border-amber-700/40 text-steel-100 text-sm px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-500 placeholder:text-steel-600"
          />
        </div>
      )}

      {/* Editable dimension fields */}
      <div>
        <p className="text-xs font-semibold text-steel-500 uppercase tracking-wide mb-3">
          Inferred Dimensions
          {missing_dims.length > 0 && (
            <span className="text-amber-400 normal-case font-normal ml-1">
              — fill in the amber fields to continue
            </span>
          )}
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {allDimKeys.map((key) => {
            const isMissing = missing_dims.includes(key);
            return (
              <div key={key} className="flex flex-col gap-1">
                <label
                  htmlFor={`dim-${key}`}
                  className={`text-xs ${isMissing ? "text-amber-400 font-medium" : "text-steel-400"}`}
                >
                  {formatDimLabel(key)}{" "}
                  {isMissing && (
                    <span className="text-amber-500 text-xs font-semibold">(required)</span>
                  )}
                </label>
                <div className={`flex items-center gap-1 rounded-md border ${
                  isMissing
                    ? "border-amber-600/60 ring-1 ring-amber-600/30"
                    : "border-steel-600"
                } bg-steel-700`}>
                  <input
                    id={`dim-${key}`}
                    type="number"
                    min="0.1"
                    max="500"
                    step="0.1"
                    value={dims[key] ?? ""}
                    onChange={(e) => handleChange(key, e.target.value)}
                    placeholder={isMissing ? "Enter value" : undefined}
                    className="w-full rounded-md bg-transparent text-steel-100 text-sm px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500 placeholder:text-steel-600"
                  />
                  <span className="text-xs text-steel-500 pr-2 shrink-0">mm</span>
                </div>
              </div>
            );
          })}
        </div>
        {/* Unfilled required dims warning */}
        {missingUnfilled.length > 0 && (
          <p className="mt-2 text-xs text-amber-400">
            Fill in: {missingUnfilled.map(formatDimLabel).join(", ")}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3 pt-1">
        <button
          onClick={handleGenerate}
          disabled={!canGenerate}
          className={`px-5 py-2 rounded-lg text-white text-sm font-semibold transition-colors ${
            canGenerate
              ? "bg-brand-600 hover:bg-brand-500 cursor-pointer"
              : "bg-steel-700 text-steel-500 cursor-not-allowed"
          }`}
        >
          Generate with these dimensions
        </button>
        <button
          onClick={onReset}
          className="px-4 py-2 rounded-lg border border-steel-600 bg-steel-700/50 text-steel-300 text-sm font-medium hover:bg-steel-700 transition-colors"
        >
          Describe differently
        </button>
      </div>
    </div>
  );
}
