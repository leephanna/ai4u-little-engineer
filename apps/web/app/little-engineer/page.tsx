"use client";

/**
 * /little-engineer — Gateway page
 *
 * The stable, public-facing front door for AI4U Little Engineer.
 * Isolated from fragile auth logic. Provides three entry paths:
 *   1. Launch App  (direct route to /invent for authenticated users)
 *   2. Email Magic Link  (primary auth fallback — works without Google)
 *   3. Google Sign-In  (de-emphasized — shown but not primary CTA)
 *
 * This page is intentionally lightweight and mostly static.
 */

import { useState } from "react";
import Link from "next/link";
import MagicLinkForm from "@/components/auth/MagicLinkForm";
import GoogleSignInButton from "@/components/auth/GoogleSignInButton";

export default function GatewayPage() {
  const [showMagicLink, setShowMagicLink] = useState(false);

  return (
    <div className="min-h-screen bg-steel-900 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-steel-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">AI</span>
          </div>
          <span className="text-steel-100 font-semibold text-sm tracking-wide">
            AI4U Little Engineer
          </span>
        </div>
        <Link
          href="/login"
          className="text-steel-400 hover:text-steel-200 text-sm transition-colors"
        >
          Sign in →
        </Link>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-md space-y-8">

          {/* Product identity */}
          <div className="text-center space-y-3">
            <div className="w-16 h-16 bg-brand-600 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-brand-900/40">
              <svg
                className="w-8 h-8 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
                />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-steel-100 tracking-tight">
              AI4U Little Engineer
            </h1>
            <p className="text-brand-400 font-medium text-lg">
              Speak an idea. Get a printable design.
            </p>
            <p className="text-steel-400 text-sm leading-relaxed max-w-sm mx-auto">
              Describe a part, upload a sketch, or drop a file — and get a
              production-ready 3D model you can print in minutes.
            </p>
          </div>

          {/* Primary CTA */}
          <div className="space-y-3">
            <Link
              href="/invent"
              className="btn-primary w-full py-3 text-base font-semibold text-center flex items-center justify-center gap-2 rounded-lg"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
              Launch App
            </Link>

            {/* Magic Link section */}
            {!showMagicLink ? (
              <button
                type="button"
                onClick={() => setShowMagicLink(true)}
                className="w-full py-2.5 rounded-lg border border-steel-700 bg-steel-800 hover:bg-steel-750 text-steel-200 text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                <svg
                  className="w-4 h-4 text-steel-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
                Email me a magic link
              </button>
            ) : (
              <div className="card space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-steel-300 text-sm font-medium">
                    Sign in with a magic link
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowMagicLink(false)}
                    className="text-steel-500 hover:text-steel-300 text-xs"
                  >
                    ✕ close
                  </button>
                </div>
                <MagicLinkForm redirectTo="/invent" />
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-steel-800" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-steel-900 px-3 text-steel-600">
                or continue with
              </span>
            </div>
          </div>

          {/* Google — tertiary, de-emphasized */}
          <div className="space-y-2">
            <GoogleSignInButton
              redirectTo="/invent"
              label="Continue with Google"
              className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-lg bg-steel-800 hover:bg-steel-750 border border-steel-700 text-steel-400 hover:text-steel-200 font-medium text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            />
            <p className="text-center text-steel-600 text-xs">
              Google sign-in may require additional setup. Use magic link if Google is unavailable.
            </p>
          </div>

          {/* Demo / Guest mode link */}
          <div className="text-center">
            <Link
              href="/demo"
              className="text-steel-500 hover:text-steel-300 text-xs transition-colors"
            >
              Try the demo without signing in →
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-4 border-t border-steel-800 text-center">
        <p className="text-steel-600 text-xs">
          © AI4U, LLC. AI4Utech.com, Lee Hanna-Owner.
        </p>
      </footer>
    </div>
  );
}
