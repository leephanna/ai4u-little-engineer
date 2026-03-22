/**
 * Stripe billing configuration for AI4U Little Engineer.
 *
 * Phase 2C: Billing tiers, plan metadata, and Stripe client singleton.
 */

import Stripe from "stripe";

// Lazy singleton — only instantiated on the server
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error("STRIPE_SECRET_KEY environment variable is not set");
    }
    _stripe = new Stripe(key, { apiVersion: "2026-02-25.clover" });
  }
  return _stripe;
}

// ── Plan definitions ──────────────────────────────────────────────────────────

export type PlanId = "free" | "maker" | "pro";

export interface Plan {
  id: PlanId;
  name: string;
  description: string;
  price_monthly_usd: number;
  generations_per_month: number | null; // null = unlimited
  features: string[];
  stripe_price_id_env: string | null; // env var name holding the Stripe Price ID
  badge?: string;
  highlight?: boolean;
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    description: "Try it out",
    price_monthly_usd: 0,
    generations_per_month: 5,
    features: [
      "5 CAD generations / month",
      "spacer, l_bracket, u_bracket",
      "STL + STEP export",
      "Community support",
    ],
    stripe_price_id_env: null,
  },
  maker: {
    id: "maker",
    name: "Maker",
    description: "For active 3D printer owners",
    price_monthly_usd: 9,
    generations_per_month: 100,
    features: [
      "100 CAD generations / month",
      "All 10 part families",
      "Printer profile tolerances",
      "Print time estimates",
      "Email notifications",
      "Priority support",
    ],
    stripe_price_id_env: "STRIPE_PRICE_ID_MAKER",
    badge: "Most Popular",
    highlight: true,
  },
  pro: {
    id: "pro",
    name: "Pro",
    description: "For power users & small shops",
    price_monthly_usd: 29,
    generations_per_month: null,
    features: [
      "Unlimited CAD generations",
      "All 10 part families",
      "Printer profile tolerances",
      "Print time estimates",
      "Email notifications",
      "Revision history & rollback",
      "Admin dashboard access",
      "Dedicated support",
    ],
    stripe_price_id_env: "STRIPE_PRICE_ID_PRO",
    badge: "Best Value",
  },
};

export const PLAN_ORDER: PlanId[] = ["free", "maker", "pro"];

/**
 * Returns the Stripe Price ID for a given plan from env vars.
 * Returns null for the free plan or if the env var is not set.
 */
export function getStripePriceId(planId: PlanId): string | null {
  const plan = PLANS[planId];
  if (!plan.stripe_price_id_env) return null;
  return process.env[plan.stripe_price_id_env] ?? null;
}

/**
 * Check if a user has exceeded their monthly generation limit.
 * Returns { allowed: boolean; remaining: number | null; plan: PlanId }
 */
export function checkGenerationAllowed(
  planId: PlanId,
  generationsThisMonth: number
): { allowed: boolean; remaining: number | null; plan: PlanId } {
  const plan = PLANS[planId];
  if (plan.generations_per_month === null) {
    return { allowed: true, remaining: null, plan: planId };
  }
  const remaining = plan.generations_per_month - generationsThisMonth;
  return {
    allowed: remaining > 0,
    remaining: Math.max(0, remaining),
    plan: planId,
  };
}
