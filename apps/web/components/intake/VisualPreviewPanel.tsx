"use client";

/**
 * VisualPreviewPanel
 *
 * Shown before final generation. Displays:
 *   - Concept render (if available from project_images) or a schematic placeholder
 *   - Print orientation suggestion
 *   - Estimated print time
 *   - Material estimate
 *   - Trust/VPL preview if available
 *   - Warnings for decorative-only or low-confidence designs
 *
 * This panel makes non-technical users feel safe before clicking GO.
 */

import type { InterpretationResult } from "@/app/api/intake/interpret/route";

interface PrintEstimate {
  time_minutes: number;
  filament_g: number;
  orientation: string;
  layer_height_mm: number;
}

interface Props {
  result: InterpretationResult;
  printerName?: string;
  material?: string;
  onConfirm: () => void;
  onEdit: () => void;
  isGenerating?: boolean;
}

// Rough print time / filament estimates by mode and scale
function estimatePrint(
  mode: string,
  scale: string | null,
  dims: Record<string, number>
): PrintEstimate {
  const maxDim = Math.max(...Object.values(dims), 50);
  const scaleFactor = maxDim / 50;

  const baseTime: Record<string, number> = {
    parametric_part: 25,
    image_to_relief: 45,
    image_to_replica: 60,
    svg_to_extrusion: 30,
    document_to_model_reference: 35,
    concept_invention: 40,
    needs_clarification: 30,
  };

  const base = baseTime[mode] ?? 35;
  const timeMin = Math.round(base * scaleFactor);
  const filamentG = Math.round(timeMin * 0.4 * scaleFactor);

  const orientations: Record<string, string> = {
    image_to_relief: "Flat side down — no supports needed",
    svg_to_extrusion: "Upright — minimal supports",
    parametric_part: "Optimized for strength",
    image_to_replica: "Largest flat face down",
    default: "Standard orientation",
  };

  return {
    time_minutes: Math.max(timeMin, 10),
    filament_g: Math.max(filamentG, 5),
    orientation: orientations[mode] ?? orientations.default,
    layer_height_mm: 0.2,
  };
}

function formatTime(minutes: number): string {
  if (minutes < 60) return `~${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `~${h}h ${m}m` : `~${h}h`;
}

function WarningBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 bg-yellow-900/30 border border-yellow-700/50 rounded-lg px-3 py-2.5">
      <span className="text-yellow-400 mt-0.5 flex-shrink-0">⚠</span>
      <p className="text-xs text-yellow-300 leading-relaxed">{message}</p>
    </div>
  );
}

export default function VisualPreviewPanel({
  result,
  printerName,
  material = "PLA",
  onConfirm,
  onEdit,
  isGenerating = false,
}: Props) {
  const {
    mode,
    inferred_object_type,
    inferred_scale,
    extracted_dimensions,
    confidence,
    missing_information,
    preview_strategy,
  } = result;

  const estimate = estimatePrint(mode, inferred_scale, extracted_dimensions ?? {});
  const isLowConfidence = confidence < 0.5;
  const isDecorativeOnly = ["image_to_relief", "image_to_replica"].includes(mode);
  const hasMissing = missing_information && missing_information.length > 0;

  // Schematic icon by mode
  const schematicIcon: Record<string, string> = {
    parametric_part: "⚙️",
    image_to_relief: "🖼",
    image_to_replica: "🏛",
    svg_to_extrusion: "🔷",
    document_to_model_reference: "📄",
    concept_invention: "💡",
    needs_clarification: "❓",
  };

  return (
    <div className="rounded-xl border border-steel-700 bg-steel-800/50 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-steel-700/50 flex items-center gap-2">
        <span className="text-base">👁</span>
        <span className="text-sm font-semibold text-steel-200">Preview Before Printing</span>
      </div>

      <div className="p-4 space-y-4">
        {/* Concept schematic */}
        <div className="rounded-xl bg-gradient-to-br from-steel-900 to-steel-800 border border-steel-700 p-6 flex flex-col items-center justify-center min-h-[140px] gap-3">
          <div className="text-5xl">{schematicIcon[mode] ?? "📦"}</div>
          <div className="text-center">
            <div className="text-sm font-medium text-steel-200 capitalize">
              {inferred_object_type ?? mode.replace(/_/g, " ")}
            </div>
            {inferred_scale && (
              <div className="text-xs text-steel-500 mt-0.5 capitalize">{inferred_scale}</div>
            )}
          </div>
          {preview_strategy && (
            <div className="text-xs text-brand-400 bg-brand-950/50 border border-brand-800 rounded-full px-3 py-1 capitalize">
              {preview_strategy.replace(/_/g, " ")}
            </div>
          )}
        </div>

        {/* Print estimates grid */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-steel-700/50 rounded-lg p-3">
            <div className="text-xs text-steel-500 mb-1">Est. Print Time</div>
            <div className="text-sm font-semibold text-steel-100">
              {formatTime(estimate.time_minutes)}
            </div>
          </div>
          <div className="bg-steel-700/50 rounded-lg p-3">
            <div className="text-xs text-steel-500 mb-1">Filament</div>
            <div className="text-sm font-semibold text-steel-100">
              ~{estimate.filament_g}g {material}
            </div>
          </div>
          <div className="bg-steel-700/50 rounded-lg p-3">
            <div className="text-xs text-steel-500 mb-1">Orientation</div>
            <div className="text-xs text-steel-300 leading-tight">{estimate.orientation}</div>
          </div>
          <div className="bg-steel-700/50 rounded-lg p-3">
            <div className="text-xs text-steel-500 mb-1">Layer Height</div>
            <div className="text-sm font-semibold text-steel-100">
              {estimate.layer_height_mm}mm
            </div>
          </div>
        </div>

        {/* Printer info */}
        {printerName && (
          <div className="flex items-center gap-2 text-xs text-steel-400">
            <span>🖨</span>
            <span>{printerName}</span>
          </div>
        )}

        {/* Trust/VPL preview */}
        <div className="flex items-center gap-2 bg-steel-700/30 border border-steel-700 rounded-lg px-3 py-2">
          <span className="text-xs">🛡</span>
          <span className="text-xs text-steel-400">
            VPL validation will run automatically after generation
          </span>
        </div>

        {/* Warnings */}
        {isLowConfidence && (
          <WarningBanner message="Low confidence — the design may not match your intent exactly. You can revise after generation." />
        )}
        {isDecorativeOnly && (
          <WarningBanner message="This will be a decorative model. It may not be structurally functional — great for display!" />
        )}
        {hasMissing && (
          <WarningBanner
            message={`Some details are still missing: ${missing_information.slice(0, 2).join(", ")}. The AI will make reasonable assumptions.`}
          />
        )}

        {/* Action buttons */}
        <div className="flex gap-3 pt-1">
          <button
            onClick={onConfirm}
            disabled={isGenerating}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white font-semibold text-sm transition-all"
          >
            {isGenerating ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Generating…
              </>
            ) : (
              "GO — Generate Now"
            )}
          </button>
          <button
            onClick={onEdit}
            disabled={isGenerating}
            className="px-4 py-3 rounded-xl border border-steel-600 text-steel-300 hover:border-steel-500 hover:text-steel-200 text-sm font-medium transition-colors"
          >
            Edit
          </button>
        </div>
      </div>
    </div>
  );
}
