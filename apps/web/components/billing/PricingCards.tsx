"use client";

/**
 * PricingCards — interactive plan selection with Stripe Checkout redirect.
 *
 * Phase 2C: Stripe billing integration
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PLANS, PLAN_ORDER, type PlanId } from "@/lib/stripe/config";

export function PricingCards() {
  const router = useRouter();
  const [loading, setLoading] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSelect(planId: PlanId) {
    if (planId === "free") {
      router.push("/sign-up");
      return;
    }
    setLoading(planId);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId }),
      });
      if (res.status === 401) {
        // Not logged in — redirect to signup with plan hint
        router.push(`/sign-up?plan=${planId}`);
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Checkout failed");
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded-xl px-4 py-3 text-red-300 text-sm text-center">
          {error}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {PLAN_ORDER.map((planId) => {
          const plan = PLANS[planId];
          const isLoading = loading === planId;

          return (
            <div
              key={planId}
              className={`card relative flex flex-col ${
                plan.highlight
                  ? "border-brand-600 bg-brand-950/20 shadow-lg shadow-brand-900/30"
                  : ""
              }`}
            >
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-brand-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                    {plan.badge}
                  </span>
                </div>
              )}

              <div className="mb-4">
                <h3 className="text-xl font-bold text-steel-100">{plan.name}</h3>
                <p className="text-steel-500 text-sm mt-0.5">{plan.description}</p>
              </div>

              <div className="mb-6">
                <span className="text-4xl font-bold text-steel-100">
                  ${plan.price_monthly_usd}
                </span>
                <span className="text-steel-500 text-sm ml-1">/month</span>
              </div>

              <ul className="space-y-2 flex-1 mb-6">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-steel-300">
                    <span className="text-green-400 mt-0.5 flex-shrink-0">✓</span>
                    {feature}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleSelect(planId)}
                disabled={isLoading}
                className={`w-full py-2.5 rounded-xl font-semibold text-sm transition-all disabled:opacity-50 ${
                  plan.highlight
                    ? "bg-brand-600 hover:bg-brand-500 text-white"
                    : "bg-steel-700 hover:bg-steel-600 text-steel-100"
                }`}
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Redirecting…
                  </span>
                ) : planId === "free" ? (
                  "Get Started Free"
                ) : (
                  `Choose ${plan.name}`
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
