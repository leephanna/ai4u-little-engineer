/**
 * /pricing — Coming Soon (Reality Lock)
 *
 * Billing is not yet active. STRIPE_SECRET_KEY is not configured.
 * The previous PricingCards component would fail at runtime with a 500.
 *
 * This page is an honest placeholder that:
 *   - Shows planned tiers clearly labelled "Coming soon"
 *   - Directs users to the free early-access product
 *   - Does NOT imply a working checkout flow
 *
 * Restore: Replace this file with the Stripe-backed version once
 * STRIPE_SECRET_KEY, STRIPE_PRICE_IDs, and webhook secret are configured.
 */
import Link from "next/link";

export const metadata = {
  title: "Pricing — AI4U Little Engineer",
  description:
    "Paid plans are coming soon. AI4U Little Engineer is free to use during early access.",
};

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-steel-900 flex flex-col">
      {/* Nav */}
      <nav className="border-b border-steel-800 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 bg-brand-600 rounded flex items-center justify-center">
            <span className="text-white font-bold text-xs">AI</span>
          </div>
          <span className="font-semibold text-steel-100 text-sm">AI4U Little Engineer</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-steel-400 hover:text-steel-100 text-sm transition-colors">
            Sign In
          </Link>
          <Link href="/signup" className="btn-primary text-sm py-1.5 px-4">
            Get Started Free
          </Link>
        </div>
      </nav>

      {/* Content */}
      <main className="flex-1 flex items-center justify-center px-6 py-20">
        <div className="max-w-lg text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-brand-900/50 border border-brand-700 rounded-full px-4 py-1.5 text-brand-400 text-xs font-semibold mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />
            Early Access — Free
          </div>

          <h1 className="text-4xl font-bold text-steel-100 mb-4">
            Pricing is coming soon.
          </h1>

          <p className="text-steel-400 text-lg mb-6 leading-relaxed">
            AI4U Little Engineer is{" "}
            <strong className="text-steel-200">free to use</strong> during early
            access. Paid plans with unlimited generations, priority queue, and
            advanced part families are in development.
          </p>

          {/* Planned tiers — clearly labelled as planned, not active */}
          <div className="grid grid-cols-3 gap-3 mb-10 text-left">
            {[
              {
                name: "Free",
                price: "Free",
                desc: "3 parts / month",
                color: "text-steel-300",
              },
              {
                name: "Maker",
                price: "$9/mo",
                desc: "Unlimited · Priority",
                color: "text-brand-400",
              },
              {
                name: "Pro",
                price: "$29/mo",
                desc: "API access · Teams",
                color: "text-purple-400",
              },
            ].map((tier) => (
              <div
                key={tier.name}
                className="bg-steel-800/60 border border-steel-700 rounded-xl p-4 opacity-70"
              >
                <div className={`text-lg font-bold mb-0.5 ${tier.color}`}>
                  {tier.price}
                </div>
                <div className="text-steel-300 text-xs font-semibold">
                  {tier.name}
                </div>
                <div className="text-steel-500 text-xs mt-1">{tier.desc}</div>
                <div className="text-steel-600 text-xs mt-2 italic">
                  Coming soon
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/signup" className="btn-primary text-base py-3 px-8">
              Start Creating Free
            </Link>
            <Link href="/demo/artemis" className="btn-secondary text-base py-3 px-8">
              🚀 Try Artemis II Demo
            </Link>
          </div>

          <p className="text-steel-600 text-xs mt-6">
            No credit card required · No commitment
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-steel-800 px-6 py-6 text-center text-steel-600 text-xs">
        <Link href="/" className="hover:text-steel-400 transition-colors">
          ← Back to AI4U Little Engineer
        </Link>
      </footer>
    </div>
  );
}
