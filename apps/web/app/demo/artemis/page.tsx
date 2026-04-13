/**
 * /demo/artemis
 *
 * Artemis II Launch Pad Demo page.
 * A featured showcase print experience for the AI4U Little Engineer platform.
 *
 * DISCLAIMER: This is a commemorative/showcase print inspired by the Artemis II mission.
 * It is NOT an official NASA model or NASA-endorsed product.
 */

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ArtemisIIDemoCard from "@/components/intake/ArtemisIIDemoCard";
import BrandSignatureBlock from "@/components/BrandSignatureBlock";
import AppFooter from "@/components/AppFooter";
import { getAuthUser } from "@/lib/auth";

export const metadata = {
  title: "Artemis II Launch Pad Demo | AI4U Little Engineer",
  description:
    "Generate a commemorative Artemis II rocket + launch pad scale model. A showcase print experience by AI4U Little Engineer.",
};

export default async function ArtemisDemoPage() {
  const supabase = await createClient();
    const user = await getAuthUser();
  if (!user) {
    redirect("/sign-in");
  }

  return (
    <main className="min-h-screen bg-steel-900">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-steel-800">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-brand-950 via-steel-900 to-purple-950 opacity-60" />
        <div className="relative max-w-3xl mx-auto px-6 py-16 text-center">
          <div className="text-6xl mb-4">🚀</div>
          <div className="inline-flex items-center gap-2 bg-brand-900/50 border border-brand-700 rounded-full px-4 py-1.5 mb-4">
            <span className="w-2 h-2 bg-brand-400 rounded-full animate-pulse" />
            <span className="text-xs font-bold text-brand-300 uppercase tracking-wider">
              Featured Demo Experience
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-steel-100 mb-4">
            Artemis II Launch Pad
          </h1>
          <p className="text-steel-400 text-lg leading-relaxed max-w-xl mx-auto mb-6">
            Generate a commemorative scale model of the Artemis II rocket and launch pad.
            Printable on any FDM printer — from palm-sized to full display model.
          </p>
          <div className="inline-flex items-center gap-2 text-xs text-steel-500 bg-steel-800/50 border border-steel-700 rounded-lg px-4 py-2">
            <span>⚠</span>
            <span>
              Showcase print inspired by Artemis II. Not an official NASA model or NASA-endorsed product.
            </span>
          </div>
        </div>
      </section>

      {/* Demo card */}
      <section className="max-w-lg mx-auto px-4 py-10">
        <ArtemisIIDemoCard />
      </section>

      {/* What you get */}
      <section className="max-w-3xl mx-auto px-6 pb-12">
        <h2 className="text-xl font-bold text-steel-200 mb-6 text-center">
          What you get
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              icon: "🏛",
              title: "Rocket + Launch Pad",
              desc: "Intricate but printable — simplified for consumer FDM printers",
            },
            {
              icon: "🛡",
              title: "VPL Validated",
              desc: "Every generated model is scored by the Virtual Print Lab before delivery",
            },
            {
              icon: "📐",
              title: "Printer-Aware",
              desc: "Adapted to your material and quality settings automatically",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="bg-steel-800/50 border border-steel-700 rounded-xl p-4 text-center"
            >
              <div className="text-3xl mb-2">{item.icon}</div>
              <div className="text-sm font-semibold text-steel-200 mb-1">{item.title}</div>
              <p className="text-xs text-steel-500 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <BrandSignatureBlock />
      <AppFooter />
    </main>
  );
}
