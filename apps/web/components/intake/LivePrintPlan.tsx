"use client";

/**
 * LivePrintPlan
 *
 * Displays the current "Print Plan" summary as the user interacts with
 * the Universal Input Composer. Updates in real-time as the interpretation
 * engine returns results and the user answers clarification questions.
 *
 * Shows:
 *   - Input source(s)
 *   - Interpretation mode
 *   - Estimated size / scale
 *   - Intended use
 *   - Current confidence
 *   - Missing info
 */

import type { InterpretationResult } from "@/app/api/intake/interpret/route";

interface Props {
  result: InterpretationResult | null;
  isLoading?: boolean;
}

const MODE_LABELS: Record<string, string> = {
  parametric_part: "Parametric Part",
  image_to_relief: "Flat Relief / Plaque",
  image_to_replica: "Simplified 3D Replica",
  svg_to_extrusion: "SVG Extrusion",
  document_to_model_reference: "Document-Referenced Model",
  concept_invention: "Concept Invention",
  needs_clarification: "Needs More Info",
};

const MODE_ICONS: Record<string, string> = {
  parametric_part: "⚙️",
  image_to_relief: "🖼",
  image_to_replica: "🏛",
  svg_to_extrusion: "🔷",
  document_to_model_reference: "📄",
  concept_invention: "💡",
  needs_clarification: "❓",
};

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 75 ? "bg-green-500" : pct >= 50 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-steel-700 rounded-full h-1.5 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-steel-400 w-8 text-right">{pct}%</span>
    </div>
  );
}

export default function LivePrintPlan({ result, isLoading }: Props) {
  if (isLoading && !result) {
    return (
      <div className="rounded-xl border border-steel-700 bg-steel-800/50 p-4 animate-pulse">
        <div className="h-4 bg-steel-700 rounded w-1/3 mb-3" />
        <div className="h-3 bg-steel-700 rounded w-2/3 mb-2" />
        <div className="h-3 bg-steel-700 rounded w-1/2" />
      </div>
    );
  }

  if (!result) return null;

  const {
    mode,
    family_candidate,
    extracted_dimensions,
    inferred_scale,
    inferred_object_type,
    missing_information,
    confidence,
    file_interpretations,
    preview_strategy,
  } = result;

  const dimEntries = Object.entries(extracted_dimensions ?? {});
  const hasMissing = missing_information && missing_information.length > 0;

  return (
    <div className="rounded-xl border border-steel-700 bg-steel-800/50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-steel-700/50">
        <div className="flex items-center gap-2">
          <span className="text-base">{MODE_ICONS[mode] ?? "📦"}</span>
          <span className="text-sm font-semibold text-steel-200">Current Print Plan</span>
        </div>
        {isLoading && (
          <div className="w-3 h-3 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
        )}
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* Mode */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-steel-500">Mode</span>
          <span className="text-xs font-medium text-brand-300">
            {MODE_LABELS[mode] ?? mode}
          </span>
        </div>

        {/* Object type */}
        {inferred_object_type && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-steel-500">Object</span>
            <span className="text-xs text-steel-200 capitalize">{inferred_object_type}</span>
          </div>
        )}

        {/* Part family */}
        {family_candidate && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-steel-500">Part Family</span>
            <span className="text-xs text-steel-200 capitalize">
              {family_candidate.replace(/_/g, " ")}
            </span>
          </div>
        )}

        {/* Scale */}
        {inferred_scale && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-steel-500">Size</span>
            <span className="text-xs text-steel-200 capitalize">{inferred_scale}</span>
          </div>
        )}

        {/* Dimensions */}
        {dimEntries.length > 0 && (
          <div>
            <span className="text-xs text-steel-500 block mb-1">Dimensions</span>
            <div className="flex flex-wrap gap-1.5">
              {dimEntries.map(([k, v]) => (
                <span
                  key={k}
                  className="text-xs bg-steel-700 text-steel-300 rounded px-2 py-0.5"
                >
                  {k}: {v}mm
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Preview strategy */}
        {preview_strategy && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-steel-500">Preview</span>
            <span className="text-xs text-steel-400 capitalize">
              {preview_strategy.replace(/_/g, " ")}
            </span>
          </div>
        )}

        {/* File interpretations */}
        {file_interpretations && file_interpretations.length > 0 && (
          <div>
            <span className="text-xs text-steel-500 block mb-1">Uploaded Files</span>
            <div className="space-y-1">
              {file_interpretations.map((fi) => (
                <div key={fi.file_name} className="flex items-center gap-2 text-xs text-steel-400">
                  <span>{fi.file_category === "image" ? "🖼" : fi.file_category === "svg" ? "🔷" : "📄"}</span>
                  <span className="truncate max-w-[120px]">{fi.file_name}</span>
                  <span className="text-steel-600">→</span>
                  <span className="text-steel-400 capitalize">{fi.interpretation.replace(/_/g, " ")}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Confidence */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-steel-500">Confidence</span>
          </div>
          <ConfidenceBar value={confidence ?? 0} />
        </div>

        {/* Missing information */}
        {hasMissing && (
          <div>
            <span className="text-xs text-steel-500 block mb-1">Still needed</span>
            <ul className="space-y-0.5">
              {missing_information.map((item) => (
                <li key={item} className="text-xs text-yellow-400 flex items-start gap-1">
                  <span className="mt-0.5">·</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Ready indicator */}
        {!hasMissing && confidence >= 0.7 && (
          <div className="flex items-center gap-2 text-green-400 text-xs font-medium pt-1">
            <span className="w-2 h-2 bg-green-400 rounded-full" />
            Ready to generate
          </div>
        )}
      </div>
    </div>
  );
}
