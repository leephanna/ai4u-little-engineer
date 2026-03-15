import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-steel-900 text-steel-50">
      {/* Nav */}
      <nav className="border-b border-steel-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">AI</span>
          </div>
          <span className="font-semibold text-steel-100">AI4U Little Engineer</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-steel-400 hover:text-steel-100 text-sm transition-colors">
            Sign In
          </Link>
          <Link href="/signup" className="btn-primary text-sm py-1.5 px-3">
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 py-24 text-center">
        <div className="inline-flex items-center gap-2 bg-brand-950 border border-brand-800 rounded-full px-4 py-1.5 text-brand-300 text-sm mb-8">
          <span className="w-2 h-2 bg-brand-400 rounded-full animate-pulse" />
          Voice-to-CAD for Machinists
        </div>

        <h1 className="text-5xl font-bold text-steel-50 leading-tight mb-6">
          Describe a part.
          <br />
          <span className="text-brand-400">Get a printable design.</span>
        </h1>

        <p className="text-xl text-steel-400 max-w-2xl mx-auto mb-10">
          Speak naturally into your phone. AI4U Little Engineer transcribes your request,
          asks only the critical questions, and generates a parametric CAD model ready for 3D printing.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/signup" className="btn-primary text-lg py-3 px-8">
            Start Building
          </Link>
          <Link href="/dashboard" className="btn-secondary text-lg py-3 px-8">
            View Demo
          </Link>
        </div>
      </section>

      {/* Feature grid */}
      <section className="max-w-5xl mx-auto px-6 py-16 grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          {
            icon: "🎙️",
            title: "Voice First",
            desc: "Tap and speak. No forms, no dropdowns. Just describe what you need in plain English.",
          },
          {
            icon: "⚙️",
            title: "Parametric CAD",
            desc: "Deterministic build123d generators produce exact STEP and STL files — not approximations.",
          },
          {
            icon: "📐",
            title: "10 Part Families",
            desc: "Spacers, brackets, clips, enclosures, bushings, jigs, and more. Expanding in V2.",
          },
          {
            icon: "✅",
            title: "Human Approval",
            desc: "Review dimensions, assumptions, and warnings before any file is released for printing.",
          },
          {
            icon: "🧠",
            title: "Learns From Prints",
            desc: "Record print outcomes. The system improves defaults for your printer and material over time.",
          },
          {
            icon: "📦",
            title: "Full Run Receipts",
            desc: "Every generation creates a receipt.json with all decisions, assumptions, and artifact paths.",
          },
        ].map((f) => (
          <div key={f.title} className="card">
            <div className="text-3xl mb-3">{f.icon}</div>
            <h3 className="font-semibold text-steel-100 mb-2">{f.title}</h3>
            <p className="text-steel-400 text-sm">{f.desc}</p>
          </div>
        ))}
      </section>

      {/* CTA */}
      <section className="max-w-2xl mx-auto px-6 py-16 text-center">
        <h2 className="text-3xl font-bold text-steel-100 mb-4">
          Ready to build your first part?
        </h2>
        <p className="text-steel-400 mb-8">
          Sign up free. No credit card required for the demo.
        </p>
        <Link href="/signup" className="btn-primary text-lg py-3 px-10">
          Create Account
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-steel-800 px-6 py-8 text-center text-steel-500 text-sm">
        <p>AI4U Little Engineer — V1 MVP · Built with Next.js, Supabase, build123d</p>
      </footer>
    </main>
  );
}
