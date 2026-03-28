"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PromptAction({ promptId }: { promptId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState<"promote" | "reject" | null>(null);

  async function handle(action: "promote" | "reject") {
    setLoading(action);
    await fetch(`/api/admin/intelligence/prompts/${promptId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setLoading(null);
    router.refresh();
  }

  return (
    <div className="flex gap-2 shrink-0">
      <button
        onClick={() => handle("promote")}
        disabled={loading !== null}
        className="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
      >
        {loading === "promote" ? "..." : "Promote to Prod"}
      </button>
      <button
        onClick={() => handle("reject")}
        disabled={loading !== null}
        className="bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
      >
        {loading === "reject" ? "..." : "Reject"}
      </button>
    </div>
  );
}
