/**
 * /account — User account page
 *
 * Shows: current plan, usage this month, subscription status,
 *        billing management portal link, and plan upgrade CTA.
 *
 * Phase 3: Full Stripe wiring
 */

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PLANS, type PlanId } from "@/lib/stripe/config";
import { ManageBillingButton } from "@/components/billing/ManageBillingButton";
import { shouldBypassLimits } from "@/lib/access-policy";
import { getAuthUser } from "@/lib/auth";

export const metadata = {
  title: "Account — AI4U Little Engineer",
};

export const dynamic = "force-dynamic";

function PlanBadge({ status }: { status: string | null }) {
  const color =
    status === "active"
      ? "bg-green-900/40 text-green-400 border-green-800"
      : status === "past_due"
      ? "bg-yellow-900/40 text-yellow-400 border-yellow-800"
      : status === "canceled"
      ? "bg-red-900/40 text-red-400 border-red-800"
      : "bg-steel-800 text-steel-400 border-steel-700";

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${color}`}>
      {status ?? "free"}
    </span>
  );
}

export default async function AccountPage() {
  const supabase = await createClient();
    const user = await getAuthUser();
  if (!user) redirect("/sign-in");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, plan, subscription_status, stripe_customer_id, generations_this_month, generation_month, current_period_end, plan_activated_at")
    .eq("id", user.id)
    .single();

  const planId = ((profile?.plan as PlanId) ?? "free") as PlanId;
  const plan = PLANS[planId];
  const currentMonth = new Date().toISOString().slice(0, 7);
  const generationsThisMonth =
    profile?.generation_month === currentMonth
      ? (profile?.generations_this_month ?? 0)
      : 0;
  const generationLimit = plan.generations_per_month;
  const bypass = await shouldBypassLimits(user.email);
  const effectiveGenerationLimit = bypass.bypassed ? null : generationLimit;
  const usagePct =
    !bypass.bypassed && effectiveGenerationLimit !== null
      ? Math.min(100, Math.round((generationsThisMonth / effectiveGenerationLimit) * 100))
      : null;

  const periodEnd = profile?.current_period_end
    ? new Date(profile.current_period_end).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div className="min-h-screen bg-steel-900">
      {/* Nav */}
      <nav className="border-b border-steel-800 px-6 py-4 flex items-center justify-between">
        <Link href="/dashboard" className="font-bold text-steel-100 text-lg">
          ⚙️ AI4U Little Engineer
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-steel-400 hover:text-steel-100 text-sm transition-colors">
            Dashboard
          </Link>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-steel-100">Account</h1>
          <p className="text-steel-400 text-sm mt-1">{user.email}</p>
        </div>

        {/* Plan card */}
        <div className="card space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold text-steel-100">{plan.name} Plan</h2>
              <p className="text-steel-500 text-sm">{plan.description}</p>
            </div>
            <PlanBadge status={profile?.subscription_status ?? null} />
          </div>

          <div className="text-2xl font-bold text-steel-100">
            ${plan.price_monthly_usd}
            <span className="text-steel-500 text-sm font-normal ml-1">/month</span>
          </div>

          {periodEnd && (
            <p className="text-steel-500 text-sm">
              Renews on <span className="text-steel-300">{periodEnd}</span>
            </p>
          )}

          {/* Usage meter */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-steel-400">Generations this month</span>
              <span className="text-steel-200 font-medium">
                {bypass.bypassed
                  ? "♾️ Unlimited (owner access)"
                  : `${generationsThisMonth}${effectiveGenerationLimit !== null ? ` / ${effectiveGenerationLimit}` : " / ∞"}`}
              </span>
            </div>
            {!bypass.bypassed && usagePct !== null && (
              <div className="h-2 bg-steel-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    usagePct >= 90
                      ? "bg-red-500"
                      : usagePct >= 70
                      ? "bg-yellow-500"
                      : "bg-brand-500"
                  }`}
                  style={{ width: `${usagePct}%` }}
                />
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            {planId !== "free" && profile?.stripe_customer_id && (
              <ManageBillingButton />
            )}
            {planId === "free" && (
              <Link href="/pricing" className="btn-primary text-sm py-2 px-4 text-center">
                Upgrade Plan
              </Link>
            )}
            {planId === "maker" && (
              <Link href="/pricing" className="btn-secondary text-sm py-2 px-4 text-center">
                Upgrade to Pro
              </Link>
            )}
          </div>
        </div>

        {/* Features */}
        <div className="card">
          <h3 className="text-sm font-semibold text-steel-300 mb-3">Plan Features</h3>
          <ul className="space-y-2">
            {plan.features.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-steel-300">
                <span className="text-green-400 mt-0.5 flex-shrink-0">✓</span>
                {f}
              </li>
            ))}
          </ul>
        </div>

        {/* Danger zone */}
        <div className="card border-red-900/50">
          <h3 className="text-sm font-semibold text-red-400 mb-1">Danger Zone</h3>
          <p className="text-steel-500 text-sm mb-3">
            To cancel your subscription or delete your account, use the billing portal or contact support.
          </p>
          {planId !== "free" && profile?.stripe_customer_id && (
            <ManageBillingButton label="Manage / Cancel Subscription" variant="danger" />
          )}
        </div>
      </div>
    </div>
  );
}
