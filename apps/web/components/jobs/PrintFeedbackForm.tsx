"use client";

/**
 * PrintFeedbackForm — star-rating feedback form for completed print jobs.
 *
 * Phase 2E: Print feedback loop
 */

import { useState } from "react";

interface PrintFeedbackFormProps {
  jobId: string;
  onSubmitted?: () => void;
}

function StarRating({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex items-center gap-3">
      <span className="text-steel-400 text-sm w-28 flex-shrink-0">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            onMouseEnter={() => setHovered(star)}
            onMouseLeave={() => setHovered(0)}
            className="text-2xl transition-transform hover:scale-110"
            aria-label={`${star} star`}
          >
            <span
              className={
                star <= (hovered || value)
                  ? "text-yellow-400"
                  : "text-steel-700"
              }
            >
              ★
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function PrintFeedbackForm({ jobId, onSubmitted }: PrintFeedbackFormProps) {
  const [overallRating, setOverallRating] = useState(0);
  const [fitRating, setFitRating] = useState(0);
  const [qualityRating, setQualityRating] = useState(0);
  const [printedSuccessfully, setPrintedSuccessfully] = useState(true);
  const [failureReason, setFailureReason] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (overallRating === 0) {
      setError("Please provide an overall rating.");
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/jobs/${jobId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          overall_rating: overallRating,
          fit_rating: fitRating || undefined,
          quality_rating: qualityRating || undefined,
          printed_successfully: printedSuccessfully,
          failure_reason: failureReason || undefined,
          notes: notes || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to submit feedback");
      }

      setSubmitted(true);
      onSubmitted?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="card border-green-800 bg-green-950/20 text-center py-6">
        <div className="text-3xl mb-2">🙏</div>
        <p className="font-semibold text-steel-100">Thanks for the feedback!</p>
        <p className="text-steel-400 text-sm mt-1">
          Your ratings help improve future generations.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      <p className="text-steel-300 text-sm">
        Did you print this part? Let us know how it turned out.
      </p>

      {/* Printed successfully toggle */}
      <div className="flex items-center gap-3">
        <span className="text-steel-400 text-sm w-28 flex-shrink-0">Printed OK?</span>
        <div className="flex gap-2">
          {[true, false].map((val) => (
            <button
              key={String(val)}
              type="button"
              onClick={() => setPrintedSuccessfully(val)}
              className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                printedSuccessfully === val
                  ? val
                    ? "bg-green-700 text-green-100"
                    : "bg-red-800 text-red-100"
                  : "bg-steel-700 text-steel-400 hover:bg-steel-600"
              }`}
            >
              {val ? "Yes ✓" : "No ✗"}
            </button>
          ))}
        </div>
      </div>

      {!printedSuccessfully && (
        <div>
          <label className="text-steel-400 text-sm block mb-1">Failure reason</label>
          <input
            type="text"
            value={failureReason}
            onChange={(e) => setFailureReason(e.target.value)}
            placeholder="e.g. warped, too tight, wrong dimensions…"
            className="input-field text-sm w-full"
          />
        </div>
      )}

      <StarRating label="Overall" value={overallRating} onChange={setOverallRating} />
      <StarRating label="Fit / Tolerance" value={fitRating} onChange={setFitRating} />
      <StarRating label="Print Quality" value={qualityRating} onChange={setQualityRating} />

      <div>
        <label className="text-steel-400 text-sm block mb-1">Notes (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Any other comments about the part or generation…"
          className="input-field text-sm w-full resize-none"
        />
      </div>

      {error && (
        <p className="text-red-400 text-sm">{error}</p>
      )}

      <button
        type="submit"
        disabled={submitting || overallRating === 0}
        className="btn-primary w-full disabled:opacity-50"
      >
        {submitting ? "Submitting…" : "Submit Feedback"}
      </button>
    </form>
  );
}
