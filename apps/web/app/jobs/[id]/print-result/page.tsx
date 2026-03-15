"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";

type Outcome = "success" | "partial" | "fail";

const ISSUE_TAGS = [
  "warping",
  "layer_separation",
  "stringing",
  "poor_fit",
  "wrong_dimensions",
  "support_issues",
  "surface_quality",
  "strength_failure",
  "other",
];

export default function PrintResultPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params.id as string;

  const [outcome, setOutcome] = useState<Outcome>("success");
  const [fitScore, setFitScore] = useState(3);
  const [strengthScore, setStrengthScore] = useState(3);
  const [surfaceScore, setSurfaceScore] = useState(3);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [printerName, setPrinterName] = useState("");
  const [material, setMaterial] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/jobs/${jobId}/print-result`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outcome,
          fit_score: fitScore,
          strength_score: strengthScore,
          surface_score: surfaceScore,
          issue_tags: selectedTags,
          notes,
          printer_name: printerName || null,
          material: material || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to save print result");
      }

      router.push(`/jobs/${jobId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setLoading(false);
    }
  }

  function ScoreSelector({
    label,
    value,
    onChange,
  }: {
    label: string;
    value: number;
    onChange: (v: number) => void;
  }) {
    return (
      <div>
        <label className="block text-sm font-medium text-steel-300 mb-2">{label}</label>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              className={`w-10 h-10 rounded-lg text-sm font-medium transition-all ${
                value === n
                  ? "bg-brand-600 text-white"
                  : "bg-steel-700 text-steel-300 hover:bg-steel-600"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-steel-900">
      <header className="border-b border-steel-800 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="text-steel-400 hover:text-steel-100 transition-colors p-1"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="font-semibold text-steel-100">Record Print Result</h1>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Outcome */}
          <div>
            <label className="block text-sm font-medium text-steel-300 mb-3">
              Print Outcome
            </label>
            <div className="grid grid-cols-3 gap-3">
              {(["success", "partial", "fail"] as Outcome[]).map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => setOutcome(o)}
                  className={`card text-center py-3 transition-all capitalize ${
                    outcome === o
                      ? o === "success"
                        ? "border-green-600 bg-green-950 text-green-300"
                        : o === "partial"
                        ? "border-yellow-600 bg-yellow-950 text-yellow-300"
                        : "border-red-600 bg-red-950 text-red-300"
                      : "hover:border-steel-600 text-steel-400"
                  }`}
                >
                  <div className="text-xl mb-1">
                    {o === "success" ? "✅" : o === "partial" ? "⚠️" : "❌"}
                  </div>
                  <div className="text-sm font-medium">{o}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Scores */}
          <div className="card space-y-4">
            <ScoreSelector label="Fit Score (1–5)" value={fitScore} onChange={setFitScore} />
            <ScoreSelector label="Strength Score (1–5)" value={strengthScore} onChange={setStrengthScore} />
            <ScoreSelector label="Surface Quality (1–5)" value={surfaceScore} onChange={setSurfaceScore} />
          </div>

          {/* Issue tags */}
          {outcome !== "success" && (
            <div>
              <label className="block text-sm font-medium text-steel-300 mb-2">
                Issues (select all that apply)
              </label>
              <div className="flex flex-wrap gap-2">
                {ISSUE_TAGS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                      selectedTags.includes(tag)
                        ? "bg-red-700 text-white"
                        : "bg-steel-700 text-steel-300 hover:bg-steel-600"
                    }`}
                  >
                    {tag.replace(/_/g, " ")}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Printer & material */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-steel-300 mb-1.5">
                Printer (optional)
              </label>
              <input
                type="text"
                value={printerName}
                onChange={(e) => setPrinterName(e.target.value)}
                className="w-full bg-steel-800 border border-steel-700 rounded-lg px-3 py-2 text-steel-100 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="e.g. Bambu X1C"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-steel-300 mb-1.5">
                Material (optional)
              </label>
              <input
                type="text"
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
                className="w-full bg-steel-800 border border-steel-700 rounded-lg px-3 py-2 text-steel-100 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="e.g. PLA, PETG"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-steel-300 mb-1.5">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full bg-steel-800 border border-steel-700 rounded-lg px-3 py-2 text-steel-100 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              placeholder="Any observations about the print..."
            />
          </div>

          {error && (
            <div className="bg-red-900/30 border border-red-800 rounded-xl px-4 py-3 text-red-300 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full py-3 touch-target"
          >
            {loading ? "Saving..." : "Save Print Result"}
          </button>
        </form>
      </main>
    </div>
  );
}
