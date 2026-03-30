"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function FeedbackReviewButton({ feedbackId }: { feedbackId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleMark() {
    setLoading(true);
    try {
      await fetch(`/api/admin/feedback/${feedbackId}/review`, { method: "POST" });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleMark}
      disabled={loading}
      className="text-xs px-3 py-1.5 rounded-lg bg-green-900/30 hover:bg-green-900/50 border border-green-800 text-green-300 transition-colors disabled:opacity-50 whitespace-nowrap"
    >
      {loading ? "Marking…" : "Mark Reviewed"}
    </button>
  );
}
