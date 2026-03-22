/**
 * /billing/success — Post-checkout confirmation page
 *
 * Phase 2C: Stripe billing integration
 */

import Link from "next/link";

export const metadata = {
  title: "Subscription Activated — AI4U Little Engineer",
};

export default function BillingSuccessPage() {
  return (
    <div className="min-h-screen bg-steel-900 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="text-6xl">🎉</div>
        <h1 className="text-3xl font-bold text-steel-100">
          You&apos;re all set!
        </h1>
        <p className="text-steel-400 text-lg">
          Your subscription is now active. Start generating production-ready CAD
          parts immediately.
        </p>
        <div className="card border-green-800 bg-green-950/20">
          <div className="flex items-center gap-3">
            <span className="text-green-400 text-2xl">✅</span>
            <div className="text-left">
              <p className="font-semibold text-steel-100">Subscription activated</p>
              <p className="text-steel-400 text-sm">
                You&apos;ll receive a confirmation email shortly.
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/dashboard" className="btn-primary py-2.5 px-6">
            Go to Dashboard
          </Link>
          <Link
            href="/jobs/new"
            className="bg-steel-700 hover:bg-steel-600 text-steel-100 py-2.5 px-6 rounded-xl font-semibold text-sm transition-colors"
          >
            Generate Your First Part
          </Link>
        </div>
      </div>
    </div>
  );
}
