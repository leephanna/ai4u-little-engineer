"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DebateActions({ debateId }: { debateId: string }) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDecision(decision: "approved" | "rejected") {
    setLoading(decision === "approved" ? "approve" : "reject");
    setError(null);
    try {
      const res = await fetch(`/api/admin/intelligence/debates/${debateId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, notes }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="card border border-amber-500/30 bg-amber-500/5">
      <h3 className="text-sm font-semibold text-amber-300 mb-3">Operator Review Required</h3>
      <textarea
        className="w-full bg-steel-900 border border-steel-700 rounded-lg px-3 py-2 text-sm text-steel-200 placeholder-steel-600 focus:outline-none focus:border-brand-500 resize-none"
        rows={3}
        placeholder="Optional notes for this decision..."
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      {error && (
        <p className="text-red-400 text-xs mt-2">{error}</p>
      )}
      <div className="flex gap-3 mt-3">
        <button
          onClick={() => handleDecision("approved")}
          disabled={loading !== null}
          className="flex-1 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors"
        >
          {loading === "approve" ? "Approving..." : "✓ Approve"}
        </button>
        <button
          onClick={() => handleDecision("rejected")}
          disabled={loading !== null}
          className="flex-1 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors"
        >
          {loading === "reject" ? "Rejecting..." : "✗ Reject"}
        </button>
      </div>
    </div>
  );
}
