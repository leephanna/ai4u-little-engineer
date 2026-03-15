"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Approval } from "@/lib/types";

interface ApprovalPanelProps {
  jobId: string;
  cadRunId: string;
  existingApproval: Approval | null;
}

export function ApprovalPanel({ jobId, cadRunId, existingApproval }: ApprovalPanelProps) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState<"approve" | "reject" | "revision" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submitDecision(decision: "approved" | "rejected" | "revision_requested") {
    setLoading(decision === "approved" ? "approve" : decision === "rejected" ? "reject" : "revision");
    setError(null);

    try {
      const res = await fetch(`/api/jobs/${jobId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cad_run_id: cadRunId, decision, notes }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Approval failed");
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="card space-y-4">
      <p className="text-steel-300 text-sm">
        Review the part specification, validation report, and generated files above.
        Approve to release for printing, or reject/request revisions.
      </p>

      <div>
        <label className="block text-sm font-medium text-steel-300 mb-1.5">
          Notes (optional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full bg-steel-900 border border-steel-700 rounded-lg px-3 py-2 text-steel-100 placeholder-steel-500 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm resize-none"
          placeholder="Add notes about your decision..."
        />
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded-lg px-3 py-2 text-red-300 text-sm">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => submitDecision("approved")}
          disabled={loading !== null}
          className="flex-1 bg-green-700 hover:bg-green-600 text-white font-medium py-2.5 rounded-xl transition-colors disabled:opacity-50 text-sm touch-target"
        >
          {loading === "approve" ? "Approving..." : "✓ Approve"}
        </button>
        <button
          onClick={() => submitDecision("revision_requested")}
          disabled={loading !== null}
          className="flex-1 bg-yellow-700 hover:bg-yellow-600 text-white font-medium py-2.5 rounded-xl transition-colors disabled:opacity-50 text-sm touch-target"
        >
          {loading === "revision" ? "Sending..." : "↺ Revise"}
        </button>
        <button
          onClick={() => submitDecision("rejected")}
          disabled={loading !== null}
          className="flex-1 bg-red-700 hover:bg-red-600 text-white font-medium py-2.5 rounded-xl transition-colors disabled:opacity-50 text-sm touch-target"
        >
          {loading === "reject" ? "Rejecting..." : "✗ Reject"}
        </button>
      </div>
    </div>
  );
}
