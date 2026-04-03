"use client";

/**
 * DualLaneSection
 *
 * Renders two equally prominent lanes on the homepage:
 *   Lane A — Build for the Shop (precision / machinist use) → /invent
 *   Lane B — Build for Fun (creative / hobby / toy use)    → /gallery
 *
 * Gap 4 fix: Fun lane cards now route to /gallery (click-to-make gallery)
 * instead of /invent. The Artemis II showcase card routes to /demo/artemis.
 * Lane A (Shop) cards continue to route to /invent with the query pre-filled.
 */
import Link from "next/link";

const SHOP_EXAMPLES = [
  { icon: "🔩", label: "Repair bracket", hint: "Replace a broken mount" },
  { icon: "⚙️", label: "Spacer / bushing", hint: "Custom bore adapter" },
  { icon: "📐", label: "Drill jig", hint: "Repeatable hole alignment" },
  { icon: "🔌", label: "Cable guide", hint: "Route and clip wires" },
  { icon: "🪛", label: "Replacement knob", hint: "Exact-fit replacement" },
  { icon: "📦", label: "Wall mount", hint: "Secure anything to a wall" },
];

/** Gap 4 fix: Fun lane cards carry their own href */
const FUN_EXAMPLES: Array<{ icon: string; label: string; hint: string; href: string }> = [
  { icon: "🏹", label: "Toothpick launcher", hint: "Desk-sized fun",         href: "/gallery?category=fun" },
  { icon: "⚔️", label: "Mini catapult",       hint: "Classic tabletop toy",  href: "/gallery?category=fun" },
  { icon: "🚀", label: "Rocket + launch pad", hint: "Artemis II showcase",   href: "/demo/artemis" },
  { icon: "🪆", label: "Desk toy / fidget",   hint: "Custom collectible",    href: "/gallery?category=fun" },
  { icon: "🪧", label: "Custom sign / plaque",hint: "Name, logo, or message",href: "/gallery?category=gift" },
  { icon: "🎁", label: "Gift replica",         hint: "From a photo or sketch",href: "/gallery?category=gift" },
];

export default function DualLaneSection() {
  return (
    <section className="max-w-5xl mx-auto px-6 py-12">
      {/* Section header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 bg-brand-900/50 border border-brand-800 rounded-full px-4 py-1.5 mb-4">
          <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse" />
          <span className="text-xs font-bold text-brand-300 uppercase tracking-wider">
            One Platform. Two Worlds.
          </span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold text-steel-100 mb-3">
          Whether you need a{" "}
          <span className="text-brand-400">precision part</span> or a{" "}
          <span className="text-purple-400">fun print</span> — we&apos;ve got you.
        </h2>
        <p className="text-steel-400 text-sm max-w-xl mx-auto">
          A machinist making a jig and a kid printing a catapult use the same platform.
          Both are first-class outcomes.
        </p>
      </div>

      {/* Two-lane grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Lane A — Shop */}
        <div className="rounded-2xl border border-steel-700 bg-gradient-to-br from-steel-900 to-steel-800/50 overflow-hidden">
          {/* Lane header */}
          <div className="px-5 py-4 border-b border-steel-700 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-900 border border-brand-700 flex items-center justify-center text-lg">
              🏭
            </div>
            <div>
              <div className="text-xs font-bold text-brand-400 uppercase tracking-wider mb-0.5">
                Lane A
              </div>
              <h3 className="text-base font-bold text-steel-100">Build for the Shop</h3>
              <p className="text-xs text-steel-500">Precision parts, repairs, fixtures</p>
            </div>
          </div>

          {/* Examples — route to /invent with query pre-filled */}
          <div className="p-4 grid grid-cols-2 gap-2">
            {SHOP_EXAMPLES.map((ex) => (
              <Link
                key={ex.label}
                href={`/invent?q=${encodeURIComponent(ex.label)}`}
                className="flex items-start gap-2 p-2.5 rounded-xl bg-steel-800/60 border border-steel-700 hover:border-brand-600 hover:bg-brand-900/20 transition-all group"
              >
                <span className="text-base flex-shrink-0">{ex.icon}</span>
                <div>
                  <div className="text-xs font-semibold text-steel-200 group-hover:text-brand-300 transition-colors">
                    {ex.label}
                  </div>
                  <div className="text-xs text-steel-500">{ex.hint}</div>
                </div>
              </Link>
            ))}
          </div>

          {/* CTA */}
          <div className="px-4 pb-4">
            <Link
              href="/invent"
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-brand-700 hover:bg-brand-600 text-white font-semibold text-sm transition-all"
            >
              <span>🔧</span>
              <span>Describe your part →</span>
            </Link>
          </div>
        </div>

        {/* Lane B — Fun (Gap 4 fix: routes to /gallery) */}
        <div className="rounded-2xl border border-purple-900/60 bg-gradient-to-br from-steel-900 to-purple-950/20 overflow-hidden">
          {/* Lane header */}
          <div className="px-5 py-4 border-b border-purple-900/50 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-900/50 border border-purple-700/50 flex items-center justify-center text-lg">
              🎨
            </div>
            <div>
              <div className="text-xs font-bold text-purple-400 uppercase tracking-wider mb-0.5">
                Lane B
              </div>
              <h3 className="text-base font-bold text-steel-100">Build for Fun</h3>
              <p className="text-xs text-steel-500">Toys, collectibles, gifts, decor</p>
            </div>
          </div>

          {/* Examples — each card has its own dedicated route */}
          <div className="p-4 grid grid-cols-2 gap-2">
            {FUN_EXAMPLES.map((ex) => (
              <Link
                key={ex.label}
                href={ex.href}
                className="flex items-start gap-2 p-2.5 rounded-xl bg-steel-800/60 border border-purple-900/40 hover:border-purple-600 hover:bg-purple-900/20 transition-all group"
              >
                <span className="text-base flex-shrink-0">{ex.icon}</span>
                <div>
                  <div className="text-xs font-semibold text-steel-200 group-hover:text-purple-300 transition-colors">
                    {ex.label}
                  </div>
                  <div className="text-xs text-steel-500">{ex.hint}</div>
                </div>
              </Link>
            ))}
          </div>

          {/* CTA — routes to gallery for Fun lane */}
          <div className="px-4 pb-4">
            <Link
              href="/gallery"
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-600 text-white font-semibold text-sm transition-all"
            >
              <span>🎉</span>
              <span>Browse the gallery →</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Unifier message */}
      <div className="mt-6 text-center">
        <p className="text-xs text-steel-600">
          Both lanes use the same universal input — type it, upload it, say it, or sketch it.
          AI4U figures out the rest.
        </p>
      </div>
    </section>
  );
}
