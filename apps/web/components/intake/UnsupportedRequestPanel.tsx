"use client";

/**
 * UnsupportedRequestPanel
 *
 * Shown when the Truth Gate returns REJECT or CLARIFY for a user's request.
 * Replaces the silent "Generation failed. Please try again." error with a
 * clear, honest explanation of why the request was rejected and what the
 * user can do next.
 *
 * Truth Gate verdicts handled:
 *   REJECT   — family is unknown or confidence is too low to proceed
 *   CLARIFY  — dimensions are missing or ambiguous; user must provide more info
 */

import React from "react";

export type TruthVerdict = "REJECT" | "CLARIFY";

export interface UnsupportedRequestPanelProps {
  verdict: TruthVerdict;
  reason: string;
  truth_label?: string;
  missing_dimensions?: string[];
  confidence?: number;
  onTryAgain: () => void;
  onUseFallbackForm?: () => void;
}

export function UnsupportedRequestPanel({
  verdict,
  reason,
  truth_label,
  missing_dimensions,
  confidence,
  onTryAgain,
  onUseFallbackForm,
}: UnsupportedRequestPanelProps) {
  const isClarify = verdict === "CLARIFY";

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex-shrink-0 w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
          <span className="text-amber-600 text-lg" aria-hidden="true">
            {isClarify ? "?" : "!"}
          </span>
        </div>
        <div>
          <h3 className="font-semibold text-amber-900 text-base">
            {isClarify
              ? "More information needed"
              : "Request not supported yet"}
          </h3>
          {truth_label && (
            <span className="inline-block mt-1 text-xs font-mono px-2 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">
              {truth_label}
            </span>
          )}
        </div>
      </div>

      {/* Reason */}
      <p className="text-sm text-amber-800 leading-relaxed">{reason}</p>

      {/* Missing dimensions list (CLARIFY only) */}
      {isClarify && missing_dimensions && missing_dimensions.length > 0 && (
        <div className="rounded-lg bg-white border border-amber-200 p-3">
          <p className="text-xs font-semibold text-amber-700 mb-2 uppercase tracking-wide">
            Missing information
          </p>
          <ul className="space-y-1">
            {missing_dimensions.map((dim) => (
              <li key={dim} className="text-sm text-amber-900 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                {dim.replace(/_/g, " ")}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Confidence indicator (REJECT only) */}
      {!isClarify && confidence !== undefined && (
        <div className="flex items-center gap-2 text-xs text-amber-700">
          <span>Confidence:</span>
          <div className="flex-1 h-1.5 rounded-full bg-amber-200 max-w-[120px]">
            <div
              className="h-1.5 rounded-full bg-amber-400"
              style={{ width: `${Math.round(confidence * 100)}%` }}
            />
          </div>
          <span>{Math.round(confidence * 100)}%</span>
        </div>
      )}

      {/* What the user can do */}
      <div className="rounded-lg bg-white border border-amber-200 p-3 space-y-1">
        <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">
          What you can do
        </p>
        {isClarify ? (
          <p className="text-sm text-amber-800">
            Describe your part with specific dimensions (e.g. &ldquo;40mm outer diameter, 120mm tall&rdquo;)
            and try again. Or use the guided form below to fill in the details step by step.
          </p>
        ) : (
          <p className="text-sm text-amber-800">
            The AI4U engine currently supports 10 parametric part families: spacers, brackets,
            clips, enclosures, bushings, jigs, and more. Try rephrasing your request as a
            specific mechanical part with dimensions, or describe the problem it needs to solve.
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3 pt-1">
        <button
          onClick={onTryAgain}
          className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 transition-colors"
        >
          Try a different description
        </button>
        {isClarify && onUseFallbackForm && (
          <button
            onClick={onUseFallbackForm}
            className="px-4 py-2 rounded-lg border border-amber-300 bg-white text-amber-800 text-sm font-medium hover:bg-amber-50 transition-colors"
          >
            Use guided form
          </button>
        )}
      </div>
    </div>
  );
}
