/**
 * /pricing — Public pricing page
 *
 * Phase 2C: Stripe billing integration
 */

import Link from "next/link";
import { PricingCards } from "@/components/billing/PricingCards";

export const metadata = {
  title: "Pricing — AI4U Little Engineer",
  description:
    "Simple, transparent pricing for AI-powered CAD generation. Start free, upgrade when you need more.",
};

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-steel-900">
      {/* Nav */}
      <nav className="border-b border-steel-800 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="font-bold text-steel-100 text-lg">
          ⚙️ AI4U Little Engineer
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

      {/* Hero */}
      <section className="text-center py-16 px-4">
        <div className="inline-flex items-center gap-2 bg-brand-950 border border-brand-800 rounded-full px-4 py-1.5 text-brand-400 text-sm mb-6">
          <span>💳</span>
          <span>Simple, transparent pricing</span>
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-steel-100 mb-4">
          Pay for what you use.
          <br />
          <span className="text-brand-400">Not a penny more.</span>
        </h1>
        <p className="text-steel-400 text-lg max-w-xl mx-auto">
          Start free with 5 generations per month. Upgrade to Maker or Pro when
          your shop needs more.
        </p>
      </section>

      {/* Pricing cards */}
      <section className="max-w-5xl mx-auto px-4 pb-16">
        <PricingCards />
      </section>

      {/* FAQ */}
      <section className="max-w-2xl mx-auto px-4 pb-20">
        <h2 className="text-2xl font-bold text-steel-100 text-center mb-8">
          Frequently Asked Questions
        </h2>
        <div className="space-y-4">
          {[
            {
              q: "What counts as a generation?",
              a: "Each time you click 'Generate CAD Model' and the worker produces a STEP/STL file, that counts as one generation. Failed or errored generations do not count.",
            },
            {
              q: "Can I cancel anytime?",
              a: "Yes. Cancel from your account settings at any time. You'll keep access until the end of your billing period.",
            },
            {
              q: "What part families are available on Free?",
              a: "The Free plan includes spacer, l_bracket, and u_bracket. Maker and Pro unlock all 10 families including flat_bracket, standoff_block, adapter_bushing, and simple_jig.",
            },
            {
              q: "Do you offer refunds?",
              a: "Yes — if you're not satisfied within the first 7 days of a paid plan, contact us for a full refund.",
            },
            {
              q: "Is there a team plan?",
              a: "Team plans are coming soon. Contact us if you need multiple seats.",
            },
          ].map(({ q, a }) => (
            <details
              key={q}
              className="card group cursor-pointer"
            >
              <summary className="font-medium text-steel-100 list-none flex items-center justify-between">
                {q}
                <span className="text-steel-500 group-open:rotate-180 transition-transform text-lg">▾</span>
              </summary>
              <p className="text-steel-400 text-sm mt-3 leading-relaxed">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-steel-800 py-16 text-center px-4">
        <h2 className="text-2xl font-bold text-steel-100 mb-4">
          Ready to stop measuring twice and cutting once?
        </h2>
        <p className="text-steel-400 mb-8">
          Join machinists who generate production-ready CAD in seconds.
        </p>
        <Link href="/signup" className="btn-primary text-base py-3 px-8 inline-block">
          Start Free — No Credit Card Required
        </Link>
      </section>
    </div>
  );
}
