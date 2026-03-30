"use client";

/**
 * ManageBillingButton — opens Stripe Customer Portal.
 *
 * Phase 3: Full Stripe wiring
 */

import { useState } from "react";

interface Props {
  label?: string;
  variant?: "primary" | "secondary" | "danger";
}

export function ManageBillingButton({
  label = "Manage Billing",
  variant = "secondary",
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Portal error");
      if (data.url) window.location.href = data.url;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const cls =
    variant === "primary"
      ? "btn-primary text-sm py-2 px-4"
      : variant === "danger"
      ? "bg-red-900/30 hover:bg-red-900/50 border border-red-800 text-red-300 text-sm py-2 px-4 rounded-xl transition-colors"
      : "btn-secondary text-sm py-2 px-4";

  return (
    <div className="space-y-1">
      <button onClick={handleClick} disabled={loading} className={`${cls} disabled:opacity-50`}>
        {loading ? (
          <span className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
            Opening…
          </span>
        ) : (
          label
        )}
      </button>
      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  );
}
