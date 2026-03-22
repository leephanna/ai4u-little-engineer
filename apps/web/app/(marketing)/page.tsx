"use client";
import Link from "next/link";
import { useState, useEffect } from "react";

// ── Animated tagline cycling through part types ──────────────────────────────
const PART_TYPES = [
  "a custom spacer",
  "an L-bracket",
  "a cable clip",
  "a standoff block",
  "an adapter bushing",
  "a drilling jig",
  "a flat bracket",
  "an enclosure lid",
  "a U-bracket saddle",
  "a mounting plate",
];

function AnimatedTagline() {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx((i) => (i + 1) % PART_TYPES.length);
        setVisible(true);
      }, 300);
    }, 2800);
    return () => clearInterval(timer);
  }, []);
  return (
    <span
      className={`text-brand-400 transition-opacity duration-300 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      {PART_TYPES[idx]}
    </span>
  );
}

// ── Problem section — 4 relatable tiles ──────────────────────────────────────
const PROBLEMS = [
  {
    icon: "😤",
    title: "CAD software is overkill",
    desc: "You just need a simple bracket — not a $300/year subscription and a 40-hour learning curve.",
  },
  {
    icon: "📏",
    title: "AI-generated meshes don't fit",
    desc: "ChatGPT gives you an STL that looks right but the holes are 0.3mm off. Every. Single. Time.",
  },
  {
    icon: "🔁",
    title: "Reprinting wastes filament",
    desc: "One bad dimension means another 2-hour print job. Your spool is shrinking, your patience faster.",
  },
  {
    icon: "🤷",
    title: "Nobody speaks machinist",
    desc: "You say 'M5 clearance hole' and every tool either ignores you or makes something completely wrong.",
  },
];

// ── How it works — 4 steps ───────────────────────────────────────────────────
const HOW_IT_WORKS = [
  {
    step: "01",
    icon: "🎙️",
    title: "Describe your part",
    desc: "Speak or type in plain English. Say 'I need a 20mm spacer with a 5mm bore' and you're done.",
  },
  {
    step: "02",
    icon: "🧠",
    title: "AI extracts dimensions",
    desc: "The AI asks only the critical missing questions — nothing more. No 20-question interrogation.",
  },
  {
    step: "03",
    icon: "🔍",
    title: "Review in 3D",
    desc: "Inspect the parametric model in-browser. Approve or iterate with one click. No surprises at the printer.",
  },
  {
    step: "04",
    icon: "🖨️",
    title: "Download and print",
    desc: "Get STEP + STL files auto-compensated for your printer's XY offset and nozzle size.",
  },
];

// ── Part family gallery — 6 MVP families ─────────────────────────────────────
const PART_FAMILIES = [
  {
    icon: "⭕",
    name: "Spacer / Bushing",
    family: "spacer",
    desc: "Cylindrical spacers and bushings. Set OD, ID, and length. Fits any bolt pattern.",
    example: "20mm OD, 5mm bore, 15mm tall",
  },
  {
    icon: "📐",
    name: "L-Bracket",
    family: "l_bracket",
    desc: "Corner mounting brackets for 90° connections. Parametric leg lengths and thickness.",
    example: "50×40mm legs, 4mm thick, 3× M4 holes",
  },
  {
    icon: "🔩",
    name: "U-Bracket / Saddle Clamp",
    family: "u_bracket",
    desc: "Saddle clamps for pipes, tubes, and round profiles. Auto-sized to pipe OD.",
    example: "22mm pipe OD, 3mm wall, 40mm flange",
  },
  {
    icon: "🟦",
    name: "Hole Plate",
    family: "hole_plate",
    desc: "Flat mounting plates with a pattern of holes. Perfect for electronics and panel mounts.",
    example: "80×60mm, 4× M3 holes, 2mm thick",
  },
  {
    icon: "📎",
    name: "Cable Clip",
    family: "cable_clip",
    desc: "Snap-fit clips for routing and securing cables, wires, and tubing.",
    example: "8mm cable OD, 2mm wall, screw base",
  },
  {
    icon: "📦",
    name: "Enclosure / Box",
    family: "enclosure",
    desc: "Parametric enclosures for electronics, sensors, and components. Lid included.",
    example: "60×40×30mm interior, 2mm wall",
  },
];

// ── Testimonials ─────────────────────────────────────────────────────────────
const TESTIMONIALS = [
  {
    quote:
      "I described a jig for my CNC router and had a printable STL in under 90 seconds. This is witchcraft.",
    name: "Marcus T.",
    role: "Hobbyist machinist · Ender 3",
  },
  {
    quote:
      "Finally a tool that speaks machinist. I said 'M5 standoff, 15mm tall, hex base' and it just worked.",
    name: "Sandra K.",
    role: "Prototyping engineer · Bambu Lab X1C",
  },
  {
    quote:
      "The printer profile tolerance feature is a game-changer. My holes actually fit now.",
    name: "Dev P.",
    role: "Maker · Prusa MK4",
  },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-steel-900 text-steel-100">
      {/* ── Sticky Nav ── */}
      <nav className="sticky top-0 z-50 bg-steel-900/90 backdrop-blur border-b border-steel-800 px-4 sm:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-brand-600 rounded flex items-center justify-center">
            <span className="text-white font-bold text-xs">AI</span>
          </div>
          <span className="font-semibold text-steel-100 text-sm">AI4U Little Engineer</span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/pricing"
            className="text-steel-400 hover:text-steel-200 text-sm transition-colors hidden sm:block"
          >
            Pricing
          </Link>
          <Link href="/login" className="text-steel-400 hover:text-steel-200 text-sm transition-colors">
            Sign In
          </Link>
          <Link href="/signup" className="btn-primary text-sm py-1.5 px-4">
            Get Started Free
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative max-w-5xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 bg-brand-950 border border-brand-800 text-brand-400 text-xs rounded-full px-3 py-1 mb-6">
          <span className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-pulse" />
          10 parametric part families · Printer-aware tolerances · Free to start
        </div>
        <h1 className="text-4xl sm:text-6xl font-bold text-steel-100 mb-4 leading-tight">
          Describe it.
          <br />
          Print <AnimatedTagline />.
        </h1>
        <p className="text-steel-400 text-lg sm:text-xl max-w-2xl mx-auto mb-8">
          AI4U Little Engineer turns plain-English descriptions into precision-fit STL and STEP
          files — optimized for your specific 3D printer — in under 90 seconds.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/signup" className="btn-primary text-base py-3 px-8">
            Create Free Account
          </Link>
          <Link
            href="/pricing"
            className="btn-secondary text-base py-3 px-8"
          >
            See Pricing
          </Link>
        </div>
        <p className="text-steel-600 text-xs mt-4">
          No credit card · No CAD software · No learning curve
        </p>
      </section>

      {/* ── Problem section — 4 relatable tiles ── */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <div className="text-center mb-10">
          <div className="text-brand-400 text-xs font-bold uppercase tracking-wider mb-2">
            Sound familiar?
          </div>
          <h2 className="text-3xl font-bold text-steel-100">
            Why 3D printer owners are frustrated
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {PROBLEMS.map((p) => (
            <div
              key={p.title}
              className="card flex gap-4 items-start hover:border-brand-700/50 transition-colors"
            >
              <div className="text-3xl flex-shrink-0">{p.icon}</div>
              <div>
                <h3 className="font-semibold text-steel-100 mb-1">{p.title}</h3>
                <p className="text-steel-400 text-sm">{p.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="text-center mt-8">
          <p className="text-brand-400 font-semibold">
            AI4U Little Engineer solves all four. Here&apos;s how.
          </p>
        </div>
      </section>

      {/* ── How it works — 4 steps ── */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <div className="text-center mb-10">
          <div className="text-brand-400 text-xs font-bold uppercase tracking-wider mb-2">
            Simple by design
          </div>
          <h2 className="text-3xl font-bold text-steel-100">How it works</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {HOW_IT_WORKS.map((step) => (
            <div key={step.step} className="card text-center">
              <div className="text-3xl mb-3">{step.icon}</div>
              <div className="text-brand-400 text-xs font-bold mb-2">{step.step}</div>
              <h3 className="font-semibold text-steel-100 mb-2">{step.title}</h3>
              <p className="text-steel-400 text-sm">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Part family gallery — 6 cards ── */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <div className="text-center mb-10">
          <div className="text-brand-400 text-xs font-bold uppercase tracking-wider mb-2">
            Ready to generate
          </div>
          <h2 className="text-3xl font-bold text-steel-100">
            6 fully parametric part families
          </h2>
          <p className="text-steel-400 mt-2 max-w-xl mx-auto">
            Every family has a dedicated generator that produces exact, dimension-traceable CAD
            — not a mesh approximation.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {PART_FAMILIES.map((f) => (
            <div
              key={f.family}
              className="card hover:border-brand-700/60 transition-colors group"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="text-2xl">{f.icon}</div>
                <h3 className="font-semibold text-steel-100 group-hover:text-brand-300 transition-colors">
                  {f.name}
                </h3>
              </div>
              <p className="text-steel-400 text-sm mb-3">{f.desc}</p>
              <div className="bg-steel-800 rounded-lg px-3 py-2 font-mono text-xs text-steel-500">
                e.g. &ldquo;{f.example}&rdquo;
              </div>
            </div>
          ))}
        </div>
        <div className="text-center mt-6">
          <p className="text-steel-500 text-sm">
            + Flat Bracket, Standoff Block, Adapter Bushing, and Simple Jig also available
          </p>
        </div>
      </section>

      {/* ── Parametric vs mesh differentiator ── */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <div className="text-center mb-10">
          <div className="text-brand-400 text-xs font-bold uppercase tracking-wider mb-2">
            Why it matters
          </div>
          <h2 className="text-3xl font-bold text-steel-100">
            Parametric CAD vs AI-generated meshes
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Parametric */}
          <div className="card border-brand-700/50 bg-brand-950/20">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xl">✅</span>
              <h3 className="font-semibold text-brand-300">AI4U Little Engineer (Parametric)</h3>
            </div>
            <ul className="space-y-2 text-sm text-steel-300">
              {[
                "Exact dimensions — every hole is exactly what you specified",
                "Printer-aware — auto-compensates for your XY offset and nozzle",
                "Editable — change one dimension and regenerate in seconds",
                "Traceable — every assumption is logged in a receipt",
                "STEP + STL — import into any CAD tool for further editing",
                "Deterministic — same input always produces the same output",
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="text-brand-400 flex-shrink-0">→</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          {/* Mesh / other AI */}
          <div className="card border-steel-700 opacity-80">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xl">❌</span>
              <h3 className="font-semibold text-steel-400">Other AI tools (Mesh-based)</h3>
            </div>
            <ul className="space-y-2 text-sm text-steel-500">
              {[
                "Approximate dimensions — holes may be 0.2–0.5mm off",
                "No printer awareness — you adjust manually or reprint",
                "Not editable — you get a mesh, not a parametric model",
                "Black box — no record of what assumptions were made",
                "STL only — cannot be imported into CAD for modification",
                "Non-deterministic — regenerating gives a different result",
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="text-red-500 flex-shrink-0">✗</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-steel-100 text-center mb-10">
          What makers are saying
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {TESTIMONIALS.map((t) => (
            <div key={t.name} className="card flex flex-col gap-4">
              <div className="flex gap-1">
                {[...Array(5)].map((_, i) => (
                  <span key={i} className="text-yellow-400 text-sm">
                    ★
                  </span>
                ))}
              </div>
              <p className="text-steel-300 text-sm italic flex-1">&ldquo;{t.quote}&rdquo;</p>
              <div className="flex items-center gap-3 pt-2 border-t border-steel-700">
                <div className="w-8 h-8 bg-brand-800 rounded-full flex items-center justify-center text-brand-300 text-xs font-bold">
                  {t.name
                    .split(" ")
                    .map((n: string) => n[0])
                    .join("")}
                </div>
                <div>
                  <div className="text-steel-200 text-sm font-medium">{t.name}</div>
                  <div className="text-steel-500 text-xs">{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing preview CTA → /pricing ── */}
      <section className="max-w-4xl mx-auto px-6 py-16">
        <div className="bg-gradient-to-br from-brand-950 via-steel-800 to-steel-900 border border-brand-800 rounded-2xl p-8 sm:p-12 text-center">
          <div className="text-brand-400 text-xs font-bold uppercase tracking-wider mb-3">
            Simple pricing
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-steel-100 mb-4">
            Start free. Upgrade when you&apos;re hooked.
          </h2>
          <p className="text-steel-400 mb-8 max-w-xl mx-auto">
            Free plan includes 3 generations per month. Maker and Pro plans unlock unlimited
            generations, priority queue, and advanced part families.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-steel-100">Free</div>
              <div className="text-steel-500 text-sm">3 parts/month</div>
            </div>
            <div className="text-steel-600 hidden sm:block">·</div>
            <div className="text-center">
              <div className="text-3xl font-bold text-brand-400">$9/mo</div>
              <div className="text-steel-500 text-sm">Maker — unlimited</div>
            </div>
            <div className="text-steel-600 hidden sm:block">·</div>
            <div className="text-center">
              <div className="text-3xl font-bold text-purple-400">$29/mo</div>
              <div className="text-steel-500 text-sm">Pro — priority + API</div>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/signup" className="btn-primary text-base py-3 px-8">
              Start Free
            </Link>
            <Link href="/pricing" className="btn-secondary text-base py-3 px-8">
              Compare Plans
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-steel-800 px-6 py-8 text-center text-steel-500 text-sm">
        <div className="flex items-center justify-center gap-2 mb-3">
          <div className="w-6 h-6 bg-brand-600 rounded flex items-center justify-center">
            <span className="text-white font-bold text-xs">AI</span>
          </div>
          <span className="text-steel-400 font-medium">AI4U Little Engineer</span>
        </div>
        <p className="text-steel-600 text-xs">
          V1.1 · Built with Next.js, Supabase, build123d · 10 part families · Printer-aware
        </p>
        <div className="flex justify-center gap-6 mt-4 text-xs">
          <Link href="/login" className="hover:text-steel-300 transition-colors">
            Sign In
          </Link>
          <Link href="/signup" className="hover:text-steel-300 transition-colors">
            Sign Up
          </Link>
          <Link href="/pricing" className="hover:text-steel-300 transition-colors">
            Pricing
          </Link>
          <Link href="/settings/printer" className="hover:text-steel-300 transition-colors">
            Printer Settings
          </Link>
        </div>
        <p className="text-steel-700 text-xs mt-4">
          © AI4U, LLC. AI4Utech.com, Lee Hanna-Owner.
        </p>
      </footer>
    </main>
  );
}
