"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

// Animated counter hook
function useCounter(target: number, duration = 1500) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let start = 0;
    const step = target / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration]);
  return count;
}

// Rotating demo phrases
const DEMO_PHRASES = [
  "I need a 20mm spacer with a 5mm bore",
  "Make me an L-bracket, 50 by 40mm, 4mm thick",
  "A cable clip for 8mm wire bundles",
  "Standoff block, M3 thread, 12mm tall",
  "Flat bracket, 80mm long, 4 holes",
  "Adapter bushing, 22mm OD, 10mm bore",
];

function RotatingPhrase() {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx((i) => (i + 1) % DEMO_PHRASES.length);
        setVisible(true);
      }, 300);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  return (
    <span className={`transition-opacity duration-300 ${visible ? "opacity-100" : "opacity-0"}`}>
      &ldquo;{DEMO_PHRASES[idx]}&rdquo;
    </span>
  );
}

// Social proof testimonials
const TESTIMONIALS = [
  {
    quote: "I described a jig for my CNC router and had a printable STL in under 90 seconds. This is witchcraft.",
    name: "Marcus T.",
    role: "Hobbyist machinist, Ender 3 owner",
  },
  {
    quote: "Finally a tool that speaks machinist. I said 'M5 standoff, 15mm tall, hex base' and it just worked.",
    name: "Sandra K.",
    role: "Prototyping engineer, Bambu Lab X1C",
  },
  {
    quote: "The printer profile tolerance feature is a game-changer. My holes actually fit now.",
    name: "Dev P.",
    role: "Maker, Prusa MK4",
  },
];

// How it works steps
const HOW_IT_WORKS = [
  { step: "01", title: "Speak or type your part", desc: "Describe what you need in plain English. No CAD knowledge required.", icon: "🎙️" },
  { step: "02", title: "AI extracts dimensions", desc: "The AI asks only the critical missing questions — nothing more.", icon: "🧠" },
  { step: "03", title: "Review before printing", desc: "Inspect the 3D model in-browser. Approve or iterate with one click.", icon: "🔍" },
  { step: "04", title: "Download and print", desc: "Get STEP + STL files optimized for your printer's tolerances.", icon: "🖨️" },
];

// Feature cards
const FEATURES = [
  { icon: "⚙️", title: "Parametric CAD, not AI guesses", desc: "Deterministic build123d generators produce exact STEP and STL files. Every dimension is traceable.", badge: "Precise" },
  { icon: "📐", title: "10 Part Families", desc: "Spacers, brackets, clips, enclosures, bushings, jigs, standoffs, and more. All fully parametric.", badge: "Expanding" },
  { icon: "🖨️", title: "Printer-aware tolerances", desc: "Save your printer profile once. Every part is auto-compensated for your nozzle and XY offset.", badge: "New" },
  { icon: "✅", title: "Human approval gate", desc: "Review dimensions, warnings, and the 3D preview before any file is released for printing.", badge: "Safe" },
  { icon: "🔁", title: "Iterate in seconds", desc: "Change a dimension, regenerate, and compare side-by-side. No CAD software needed.", badge: "Fast" },
  { icon: "📦", title: "Full audit receipts", desc: "Every generation creates a receipt.json with all decisions, assumptions, and artifact paths.", badge: "Traceable" },
];

export default function LandingPage() {
  const jobCount = useCounter(1247);
  const partCount = useCounter(10);
  const timeCount = useCounter(90);

  return (
    <main className="min-h-screen bg-steel-900 text-steel-50 overflow-x-hidden">

      {/* ── Sticky Nav ── */}
      <nav className="sticky top-0 z-50 border-b border-steel-800 bg-steel-900/90 backdrop-blur-md px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center shadow-lg shadow-brand-900/50">
            <span className="text-white font-bold text-sm">AI</span>
          </div>
          <span className="font-semibold text-steel-100">AI4U Little Engineer</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-steel-400 hover:text-steel-100 text-sm transition-colors">Sign In</Link>
          <Link href="/signup" className="btn-primary text-sm py-1.5 px-4">Get Started Free</Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative max-w-5xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-brand-600/10 rounded-full blur-3xl" />
        </div>
        <div className="inline-flex items-center gap-2 bg-brand-950 border border-brand-800 rounded-full px-4 py-1.5 text-brand-300 text-sm mb-8 animate-fade-in">
          <span className="w-2 h-2 bg-brand-400 rounded-full animate-pulse" />
          Voice-to-CAD for 3D Printer Owners
        </div>
        <h1 className="text-5xl sm:text-6xl font-bold text-steel-50 leading-tight mb-6 animate-slide-up">
          Say the part.
          <br />
          <span className="text-brand-400">Print the part.</span>
        </h1>
        <p className="text-xl text-steel-400 max-w-2xl mx-auto mb-8 animate-slide-up">
          AI4U Little Engineer turns plain-English descriptions into precision CAD files
          optimized for your specific 3D printer — in under 90 seconds.
        </p>
        <div className="inline-block bg-steel-800 border border-steel-700 rounded-xl px-5 py-3 text-brand-300 font-mono text-sm mb-10">
          <RotatingPhrase />
        </div>
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
          <Link href="/signup" className="btn-primary text-lg py-3 px-10">Start Building Free</Link>
          <Link href="/dashboard" className="btn-secondary text-lg py-3 px-10">See a Demo</Link>
        </div>
        <div className="grid grid-cols-3 gap-6 max-w-lg mx-auto">
          {[
            { value: jobCount.toLocaleString(), label: "Parts generated" },
            { value: partCount, label: "Part families" },
            { value: `<${timeCount}s`, label: "Avg. generation time" },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-2xl font-bold text-brand-400">{s.value}</div>
              <div className="text-xs text-steel-500 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-steel-100 text-center mb-12">From idea to STL in 4 steps</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {HOW_IT_WORKS.map((step) => (
            <div key={step.step} className="card text-center">
              <div className="text-3xl mb-3">{step.icon}</div>
              <div className="text-brand-400 font-mono text-xs font-bold mb-2">STEP {step.step}</div>
              <h3 className="font-semibold text-steel-100 mb-2">{step.title}</h3>
              <p className="text-steel-400 text-sm">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-steel-100 text-center mb-4">Built for makers who care about precision</h2>
        <p className="text-steel-400 text-center max-w-xl mx-auto mb-12">Not a vague AI sketch. Real parametric geometry, real tolerances, real files.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {FEATURES.map((f) => (
            <div key={f.title} className="card group hover:border-brand-700 transition-colors duration-200">
              <div className="flex items-start justify-between mb-3">
                <div className="text-3xl">{f.icon}</div>
                <span className="text-xs bg-brand-950 border border-brand-800 text-brand-400 rounded-full px-2 py-0.5">{f.badge}</span>
              </div>
              <h3 className="font-semibold text-steel-100 mb-2">{f.title}</h3>
              <p className="text-steel-400 text-sm">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Printer Profile Callout ── */}
      <section className="max-w-4xl mx-auto px-6 py-12">
        <div className="bg-gradient-to-r from-brand-950 to-steel-800 border border-brand-800 rounded-2xl p-8 flex flex-col md:flex-row items-center gap-6">
          <div className="text-5xl">🖨️</div>
          <div className="flex-1">
            <div className="text-brand-400 text-xs font-bold uppercase tracking-wider mb-2">New in V1.1</div>
            <h3 className="text-xl font-bold text-steel-100 mb-2">Printer-aware tolerance compensation</h3>
            <p className="text-steel-400 text-sm">
              Save your printer&apos;s XY compensation, nozzle size, and build volume once.
              Every part is automatically adjusted so holes fit, threads work, and nothing warps.
              Works with Bambu Lab, Prusa, Ender, Voron, and any FDM printer.
            </p>
          </div>
          <Link href="/settings/printer" className="btn-primary whitespace-nowrap">Set Up Printer</Link>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-steel-100 text-center mb-12">What makers are saying</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {TESTIMONIALS.map((t) => (
            <div key={t.name} className="card flex flex-col gap-4">
              <div className="flex gap-1">
                {[...Array(5)].map((_, i) => <span key={i} className="text-accent-yellow text-sm">★</span>)}
              </div>
              <p className="text-steel-300 text-sm italic flex-1">{t.quote}</p>
              <div className="flex items-center gap-3 pt-2 border-t border-steel-700">
                <div className="w-8 h-8 bg-brand-800 rounded-full flex items-center justify-center text-brand-300 text-xs font-bold">
                  {t.name.split(" ").map((n: string) => n[0]).join("")}
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

      {/* ── Part Families ── */}
      <section className="max-w-4xl mx-auto px-6 py-12">
        <h2 className="text-2xl font-bold text-steel-100 text-center mb-8">10 fully parametric part families</h2>
        <div className="flex flex-wrap justify-center gap-3">
          {["Spacer / Bushing","L-Bracket","U-Bracket","Hole Plate","Cable Clip","Enclosure","Flat Bracket","Standoff Block","Adapter Bushing","Drilling Jig"].map((part) => (
            <span key={part} className="bg-steel-800 border border-steel-700 text-steel-300 text-sm rounded-full px-4 py-1.5">{part}</span>
          ))}
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="max-w-2xl mx-auto px-6 py-20 text-center">
        <h2 className="text-4xl font-bold text-steel-100 mb-4">Your next part is 90 seconds away</h2>
        <p className="text-steel-400 mb-8 text-lg">Free to start. No credit card. No CAD software. Just describe and print.</p>
        <Link href="/signup" className="btn-primary text-lg py-4 px-12">Create Free Account</Link>
        <p className="text-steel-600 text-xs mt-4">
          Already have an account?{" "}
          <Link href="/login" className="text-brand-400 hover:underline">Sign in</Link>
        </p>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-steel-800 px-6 py-8 text-center text-steel-500 text-sm">
        <div className="flex items-center justify-center gap-2 mb-3">
          <div className="w-6 h-6 bg-brand-600 rounded flex items-center justify-center">
            <span className="text-white font-bold text-xs">AI</span>
          </div>
          <span className="text-steel-400 font-medium">AI4U Little Engineer</span>
        </div>
        <p className="text-steel-600">V1.1 · Built with Next.js, Supabase, build123d · 10 part families · Printer-aware</p>
        <div className="flex justify-center gap-6 mt-4 text-xs">
          <Link href="/login" className="hover:text-steel-300 transition-colors">Sign In</Link>
          <Link href="/signup" className="hover:text-steel-300 transition-colors">Sign Up</Link>
          <Link href="/settings/printer" className="hover:text-steel-300 transition-colors">Printer Settings</Link>
        </div>
      </footer>
    </main>
  );
}
