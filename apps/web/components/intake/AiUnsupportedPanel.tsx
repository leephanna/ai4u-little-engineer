"use client";

/**
 * AiUnsupportedPanel
 *
 * Shown when the AI Router returns outcome = "unsupported" (family === null).
 * Replaces the silent dead-end with:
 *   - "We can't make that exact shape yet" header
 *   - AI's explanation of why
 *   - 3 example prompts the system CAN handle (drawn from EXAMPLE_PROMPTS)
 *   - "Try one of these" buttons that pre-fill the input
 *
 * This is distinct from UnsupportedRequestPanel (which handles Truth Gate
 * REJECT/CLARIFY verdicts). AiUnsupportedPanel handles the AI router's
 * "no matching family" outcome.
 */

import React from "react";

export interface ExamplePrompt {
  label: string;
  family: string;
}

export interface AiUnsupportedPanelProps {
  explanation: string;
  suggestions: ExamplePrompt[];
  onTryExample: (prompt: string) => void;
  onReset: () => void;
}

export function AiUnsupportedPanel({
  explanation,
  suggestions,
  onTryExample,
  onReset,
}: AiUnsupportedPanelProps) {
  return (
    <div className="rounded-xl border border-steel-600 bg-steel-800/60 p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex-shrink-0 w-8 h-8 rounded-full bg-steel-700 flex items-center justify-center">
          <span className="text-steel-400 text-base" aria-hidden="true">⊘</span>
        </div>
        <div>
          <h3 className="font-semibold text-steel-100 text-base">
            We can&apos;t make that exact shape yet
          </h3>
          <p className="text-sm text-steel-400 mt-0.5">
            AI4U currently supports 11 parametric part families.
          </p>
        </div>
      </div>

      {/* AI explanation */}
      <p className="text-sm text-steel-300 leading-relaxed">{explanation}</p>

      {/* Example prompts */}
      {suggestions.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-steel-500 uppercase tracking-wide mb-3">
            Things we CAN make — try one of these:
          </p>
          <div className="space-y-2">
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => onTryExample(s.label)}
                className="w-full text-left px-4 py-3 rounded-lg border border-steel-600 bg-steel-700/40 hover:bg-steel-700 hover:border-brand-600/50 transition-colors group"
              >
                <span className="text-sm text-steel-200 group-hover:text-brand-300 transition-colors">
                  {s.label}
                </span>
                <span className="ml-2 text-xs text-steel-500 font-mono">
                  [{s.family.replace(/_/g, " ")}]
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-3 pt-1">
        <button
          onClick={onReset}
          className="px-4 py-2 rounded-lg bg-steel-700 hover:bg-steel-600 text-steel-200 text-sm font-medium transition-colors"
        >
          Try a different description
        </button>
      </div>
    </div>
  );
}
