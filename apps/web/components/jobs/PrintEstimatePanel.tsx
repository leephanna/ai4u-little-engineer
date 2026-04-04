"use client";

/**
 * PrintEstimatePanel — shows print time estimate, material, and save-to-library button.
 *
 * Displayed on the job detail page after a successful CAD run.
 *
 * Phase 7: UX improvements
 */

import { useState } from "react";

interface Props {
  jobId: string;
  jobTitle: string;
  family: string | null;
  material: string | null;
  printTimeMinutes: number | null;
  stlSizeBytes: number | null;
  status: string;
}

function formatPrintTime(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PrintEstimatePanel({
  jobId,
  jobTitle,
  family,
  material,
  printTimeMinutes,
  stlSizeBytes,
  status,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Allow saving for approved, printed, AND completed
  // (Artemis II jobs land in "completed" status, not "approved")
  const canSave = ["approved", "printed", "completed"].includes(status);

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: jobId, title: jobTitle }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setSaved(true);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const hasEstimates = printTimeMinutes !== null || material || stlSizeBytes !== null;

  if (!hasEstimates && !canSave) return null;

  return (
    <div className="card space-y-4">
      {hasEstimates && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {printTimeMinutes !== null && (
            <div>
              <p className="text-xs text-steel-500 mb-0.5">Est. Print Time</p>
              <p className="text-steel-100 font-semibold text-sm">
                ⏱ {formatPrintTime(printTimeMinutes)}
              </p>
            </div>
          )}
          {material && (
            <div>
              <p className="text-xs text-steel-500 mb-0.5">Material</p>
              <p className="text-steel-100 font-semibold text-sm">
                🧵 {material}
              </p>
            </div>
          )}
          {stlSizeBytes !== null && (
            <div>
              <p className="text-xs text-steel-500 mb-0.5">STL Size</p>
              <p className={`font-semibold text-sm ${stlSizeBytes > 1_500_000 ? "text-yellow-400" : "text-steel-100"}`}>
                📦 {formatFileSize(stlSizeBytes)}
                {stlSizeBytes > 1_500_000 && (
                  <span className="text-xs text-yellow-500 ml-1">(large)</span>
                )}
              </p>
            </div>
          )}
        </div>
      )}

      {canSave && (
        <div className="pt-2 border-t border-steel-800">
          {saved ? (
            <p className="text-green-400 text-sm flex items-center gap-2">
              <span>✓</span> Saved to project library
            </p>
          ) : (
            <div className="space-y-1">
              <button
                onClick={handleSave}
                disabled={saving}
                className="btn-secondary text-sm py-1.5 px-4 disabled:opacity-50"
              >
                {saving ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                    Saving…
                  </span>
                ) : (
                  "📚 Save to Library"
                )}
              </button>
              {saveError && (
                <p className="text-red-400 text-xs">{saveError}</p>
              )}
              {family && (
                <p className="text-steel-600 text-xs">
                  Saves this {family.replace(/_/g, " ")} design for community reuse
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
