"use client";
/**
 * ClarifyFallbackForm
 *
 * Shown when the LLM clarify flow fails twice.
 * Provides a structured slot-fill form so the user always has a path forward.
 * Covers the most common missing fields: object type, size, material, purpose.
 */
import { useState } from "react";

interface FallbackValues {
  object_type: string;
  height_mm: string;
  width_mm: string;
  material: string;
  purpose: string;
  detail_level: string;
}

interface Props {
  sessionId: string;
  existingDimensions?: Record<string, number>;
  existingObjectType?: string;
  onConfirm: (values: FallbackValues) => void;
  onReset: () => void;
}

const MATERIALS = ["PLA", "PETG", "ABS", "TPU", "Resin"];
const PURPOSES = ["Display / decorative", "Functional / daily use", "Prototype / test fit", "Gift"];
const DETAIL_LEVELS = ["Fast (draft quality)", "Standard", "Fine detail"];

export function ClarifyFallbackForm({
  existingDimensions = {},
  existingObjectType = "",
  onConfirm,
  onReset,
}: Props) {
  const [values, setValues] = useState<FallbackValues>({
    object_type: existingObjectType,
    height_mm: existingDimensions.height_mm?.toString() ?? existingDimensions.height?.toString() ?? "",
    width_mm: existingDimensions.width_mm?.toString() ?? existingDimensions.width?.toString() ?? "",
    material: "PLA",
    purpose: "Display / decorative",
    detail_level: "Standard",
  });

  const canSubmit = values.object_type.trim().length > 0;

  return (
    <div className="rounded-xl border border-amber-700/50 bg-amber-900/10 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-amber-700/30 flex items-center gap-2">
        <span className="text-amber-400 text-sm">📋</span>
        <span className="text-sm font-medium text-steel-200">Quick Design Form</span>
        <span className="ml-auto text-xs text-steel-500">Fill in what you know — the rest uses smart defaults</span>
      </div>

      <div className="p-4 space-y-4">
        {/* Object type */}
        <div>
          <label className="block text-xs font-medium text-steel-400 mb-1">
            What do you want to make? <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={values.object_type}
            onChange={(e) => setValues((v) => ({ ...v, object_type: e.target.value }))}
            placeholder="e.g. rocket model, cable holder, wall hook…"
            className="w-full bg-steel-800 border border-steel-700 rounded-lg px-3 py-2 text-sm text-steel-200 placeholder-steel-500 focus:outline-none focus:border-brand-500"
          />
        </div>

        {/* Size */}
        <div>
          <label className="block text-xs font-medium text-steel-400 mb-1">
            Size (leave blank for smart default)
          </label>
          <div className="grid grid-cols-2 gap-2">
            <div className="relative">
              <input
                type="number"
                value={values.height_mm}
                onChange={(e) => setValues((v) => ({ ...v, height_mm: e.target.value }))}
                placeholder="Height"
                min="1"
                max="300"
                className="w-full bg-steel-800 border border-steel-700 rounded-lg px-3 py-2 text-sm text-steel-200 placeholder-steel-500 focus:outline-none focus:border-brand-500"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-steel-500">mm</span>
            </div>
            <div className="relative">
              <input
                type="number"
                value={values.width_mm}
                onChange={(e) => setValues((v) => ({ ...v, width_mm: e.target.value }))}
                placeholder="Width / Diameter"
                min="1"
                max="300"
                className="w-full bg-steel-800 border border-steel-700 rounded-lg px-3 py-2 text-sm text-steel-200 placeholder-steel-500 focus:outline-none focus:border-brand-500"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-steel-500">mm</span>
            </div>
          </div>
        </div>

        {/* Material */}
        <div>
          <label className="block text-xs font-medium text-steel-400 mb-1">Material</label>
          <div className="flex flex-wrap gap-2">
            {MATERIALS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setValues((v) => ({ ...v, material: m }))}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  values.material === m
                    ? "bg-brand-700 border-brand-600 text-white"
                    : "bg-steel-800 border-steel-700 text-steel-400 hover:border-steel-500"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Purpose */}
        <div>
          <label className="block text-xs font-medium text-steel-400 mb-1">Purpose</label>
          <select
            value={values.purpose}
            onChange={(e) => setValues((v) => ({ ...v, purpose: e.target.value }))}
            className="w-full bg-steel-800 border border-steel-700 rounded-lg px-3 py-2 text-sm text-steel-200 focus:outline-none focus:border-brand-500"
          >
            {PURPOSES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        {/* Detail level */}
        <div>
          <label className="block text-xs font-medium text-steel-400 mb-1">Detail level</label>
          <div className="flex gap-2">
            {DETAIL_LEVELS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setValues((v) => ({ ...v, detail_level: d }))}
                className={`flex-1 text-xs px-2 py-1.5 rounded-lg border transition-colors ${
                  values.detail_level === d
                    ? "bg-brand-700 border-brand-600 text-white"
                    : "bg-steel-800 border-steel-700 text-steel-400 hover:border-steel-500"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={() => onConfirm(values)}
            disabled={!canSubmit}
            className="flex-1 btn-primary py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Generate →
          </button>
          <button
            type="button"
            onClick={onReset}
            className="text-xs text-steel-500 hover:text-steel-300 transition-colors"
          >
            Start over
          </button>
        </div>
      </div>
    </div>
  );
}
