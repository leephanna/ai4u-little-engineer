"use client";

/**
 * RevisionPanel — allows users to request a revision of a completed or
 * rejected CAD job by describing what needs to change.
 *
 * Phase 2D: Revision / iteration flow
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

interface RevisionPanelProps {
  jobId: string;
  currentVersion: number;
  currentFamily: string;
}

const REVISION_SUGGESTIONS = [
  "Make it 5mm taller",
  "Increase wall thickness to 3mm",
  "Add a second mounting hole",
  "Make the hole diameter 6mm instead",
  "Reduce overall size by 20%",
  "Add chamfers to all edges",
];

export function RevisionPanel({ jobId, currentVersion, currentFamily }: RevisionPanelProps) {
  const router = useRouter();
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  async function handleRevision() {
    if (!feedback.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/revise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feedback: feedback.trim(),
          base_version: currentVersion,
          family: currentFamily,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Request failed: ${res.status}`);
      }
      router.refresh();
      setFeedback("");
      setExpanded(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Revision request failed");
    } finally {
      setLoading(false);
    }
  }

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="w-full card border-dashed border-steel-600 hover:border-brand-600 text-steel-400 hover:text-brand-400 transition-colors text-sm py-3 flex items-center justify-center gap-2"
      >
        <span className="text-lg">✏️</span>
        Request a revision
      </button>
    );
  }

  return (
    <div className="card border-brand-800 bg-brand-950/30 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-steel-100 flex items-center gap-2">
          <span>✏️</span> Request Revision
        </h3>
        <button
          onClick={() => { setExpanded(false); setFeedback(""); setError(null); }}
          className="text-steel-500 hover:text-steel-300 transition-colors text-sm"
        >
          Cancel
        </button>
      </div>

      <p className="text-steel-400 text-sm">
        Describe what you want to change. A new spec version will be created and
        queued for generation automatically.
      </p>

      {/* Quick suggestion chips */}
      <div className="flex flex-wrap gap-2">
        {REVISION_SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setFeedback(s)}
            className="text-xs bg-steel-800 hover:bg-steel-700 border border-steel-700 text-steel-300 rounded-full px-3 py-1 transition-colors"
          >
            {s}
          </button>
        ))}
      </div>

      <textarea
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        placeholder={`Describe your changes, e.g. "Make the hole 6mm diameter and add a chamfer to the top edge"`}
        rows={3}
        className="w-full bg-steel-800 border border-steel-700 rounded-xl px-4 py-3 text-steel-100 placeholder-steel-500 text-sm resize-none focus:outline-none focus:border-brand-600 transition-colors"
      />

      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded-lg px-3 py-2 text-red-300 text-xs">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-steel-500 text-xs">
          This will create spec v{currentVersion + 1} and queue a new generation.
        </span>
        <button
          onClick={handleRevision}
          disabled={loading || !feedback.trim()}
          className="btn-primary text-sm py-2 px-5 disabled:opacity-50"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Submitting…
            </span>
          ) : (
            "Submit Revision"
          )}
        </button>
      </div>
    </div>
  );
}
