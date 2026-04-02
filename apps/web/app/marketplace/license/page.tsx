import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Marketplace License Terms | AI4U Little Engineer",
  description:
    "License terms governing the purchase and use of 3D designs on the AI4U Little Engineer marketplace.",
};

const EFFECTIVE_DATE = "April 1, 2026";
const COMPANY = "AI4U, LLC";
const OWNER = "Lee Hanna";
const WEBSITE = "AI4Utech.com";

export default function MarketplaceLicensePage() {
  return (
    <div className="min-h-screen bg-steel-900">
      {/* Header */}
      <header className="border-b border-steel-800 px-4 sm:px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">AI</span>
          </div>
          <span className="font-semibold text-steel-100">Little Engineer</span>
        </div>
        <Link href="/marketplace" className="text-sm text-steel-400 hover:text-steel-200 transition-colors">
          ← Back to Marketplace
        </Link>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10 space-y-8">
        {/* Title block */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-steel-100">Marketplace License Terms</h1>
          <p className="text-steel-400 text-sm">
            Effective Date: {EFFECTIVE_DATE} &nbsp;·&nbsp; {COMPANY} &nbsp;·&nbsp; {OWNER}, Owner
          </p>
          <p className="text-steel-500 text-xs">
            © {COMPANY}. {WEBSITE}
          </p>
        </div>

        {/* Summary box */}
        <div className="card bg-brand-900/20 border-brand-800 space-y-2">
          <h2 className="font-semibold text-brand-300">License Summary</h2>
          <p className="text-sm text-steel-300">
            When you purchase a design on the AI4U marketplace, you receive a{" "}
            <strong className="text-steel-100">perpetual, non-exclusive, worldwide license</strong> to use
            the design files for personal and commercial manufacturing. You may not resell the original
            files or claim authorship of the AI-generated design.
          </p>
        </div>

        <div className="space-y-6 text-steel-300 text-sm leading-relaxed">

          {/* 1 */}
          <section className="card space-y-3">
            <h2 className="text-lg font-semibold text-steel-100">1. What You Receive</h2>
            <p>
              Upon completing a purchase on the AI4U marketplace, you receive:
            </p>
            <ul className="list-disc list-inside space-y-1 text-steel-400">
              <li>Downloadable STL and/or STEP files for the purchased design</li>
              <li>A perpetual, non-exclusive, worldwide license to use the design files</li>
              <li>The right to manufacture physical objects from the design for personal or commercial use</li>
              <li>Access to the design&apos;s Virtual Print Lab validation report and trust tier certificate</li>
            </ul>
          </section>

          {/* 2 */}
          <section className="card space-y-3">
            <h2 className="text-lg font-semibold text-steel-100">2. Permitted Uses</h2>
            <p>You are permitted to:</p>
            <ul className="list-disc list-inside space-y-1 text-steel-400">
              <li>Print or manufacture the design for personal use</li>
              <li>Print or manufacture the design for commercial sale as a physical product</li>
              <li>Modify the design for your own use (modified designs are not covered by the original VPL validation)</li>
              <li>Use the design in educational or research contexts</li>
              <li>Share printed physical objects made from the design</li>
            </ul>
          </section>

          {/* 3 */}
          <section className="card space-y-3">
            <h2 className="text-lg font-semibold text-steel-100">3. Prohibited Uses</h2>
            <p>You are <strong className="text-red-400">not</strong> permitted to:</p>
            <ul className="list-disc list-inside space-y-1 text-steel-400">
              <li>Resell, redistribute, or sublicense the original design files (STL/STEP) to third parties</li>
              <li>Upload the design to other marketplaces or file-sharing platforms</li>
              <li>Claim authorship or original creation of the AI-generated design</li>
              <li>Remove or obscure the AI4U origin metadata embedded in the design files</li>
              <li>Use the design to create weapons, illegal devices, or items intended to cause harm</li>
              <li>Represent the design as having passed engineering certification beyond the VPL validation score</li>
            </ul>
          </section>

          {/* 4 */}
          <section className="card space-y-3">
            <h2 className="text-lg font-semibold text-steel-100">4. Design Origin and Metadata</h2>
            <p>
              All designs sold on the AI4U marketplace carry embedded metadata identifying them as
              AI-generated content:
            </p>
            <div className="bg-steel-800 rounded-lg px-4 py-3 font-mono text-xs text-steel-300 space-y-1">
              <div><span className="text-indigo-400">origin:</span> ai_generated</div>
              <div><span className="text-indigo-400">platform:</span> AI4U Little Engineer</div>
              <div><span className="text-indigo-400">validated:</span> true</div>
              <div><span className="text-indigo-400">validated_at:</span> [ISO 8601 timestamp]</div>
              <div><span className="text-indigo-400">vpl_grade:</span> A | B | C | D | F</div>
              <div><span className="text-indigo-400">trust_tier:</span> trusted_commercial | verified | ...</div>
            </div>
            <p>
              This metadata is part of the design record and must not be altered or removed.
            </p>
          </section>

          {/* 5 */}
          <section className="card space-y-3">
            <h2 className="text-lg font-semibold text-steel-100">5. Quality Assurance</h2>
            <p>
              All designs available for purchase on the marketplace have achieved a{" "}
              <strong className="text-emerald-300">Verified Commercial</strong> trust tier, meaning they
              have passed Virtual Print Lab (VPL) validation with a Grade A or B and a score of 75 or
              higher. This indicates a high probability of successful printing.
            </p>
            <p>
              However, print success depends on your specific printer, materials, settings, and environment.
              {COMPANY} does not guarantee that any design will print successfully on your specific equipment.
              Always perform a test print before committing to a production run.
            </p>
          </section>

          {/* 6 */}
          <section className="card space-y-3">
            <h2 className="text-lg font-semibold text-steel-100">6. Refund Policy</h2>
            <p>
              Due to the digital nature of design files, all sales are final. Refunds are only issued if:
            </p>
            <ul className="list-disc list-inside space-y-1 text-steel-400">
              <li>The design files are corrupted or cannot be downloaded</li>
              <li>The design is materially different from its description or images</li>
              <li>A technical error prevented delivery of the purchased files</li>
            </ul>
            <p>
              To request a refund, contact{" "}
              <a href="mailto:support@ai4utech.com" className="text-brand-400 hover:text-brand-300 underline">
                support@ai4utech.com
              </a>{" "}
              within 7 days of purchase.
            </p>
          </section>

          {/* 7 */}
          <section className="card space-y-3">
            <h2 className="text-lg font-semibold text-steel-100">7. Creator Revenue Share</h2>
            <p>
              Creators who publish designs on the marketplace receive a revenue share of each sale as
              disclosed in the creator dashboard. {COMPANY} retains a platform fee to cover infrastructure,
              VPL validation, and trust certification costs. Revenue is paid out monthly via Stripe.
            </p>
          </section>

          {/* 8 */}
          <section className="card space-y-3">
            <h2 className="text-lg font-semibold text-steel-100">8. Disclaimer</h2>
            <p>
              DESIGNS ARE PROVIDED FOR MANUFACTURING REFERENCE ONLY. {COMPANY.toUpperCase()} MAKES NO
              WARRANTY THAT ANY DESIGN IS STRUCTURALLY SOUND, SAFE, OR FIT FOR ANY PARTICULAR PURPOSE.
              YOU ASSUME ALL RISK ASSOCIATED WITH PRINTING, MANUFACTURING, OR USING ANY DESIGN PURCHASED
              FROM THE MARKETPLACE.
            </p>
          </section>

        </div>

        {/* Footer */}
        <div className="border-t border-steel-800 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-steel-600">
          <span>© {COMPANY}. {WEBSITE}, {OWNER}-Owner. All rights reserved.</span>
          <div className="flex gap-4">
            <Link href="/terms" className="hover:text-steel-400 transition-colors">Terms of Use</Link>
            <Link href="/marketplace" className="hover:text-steel-400 transition-colors">Marketplace</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
