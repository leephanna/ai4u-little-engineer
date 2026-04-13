"use client";
/**
 * /little-engineer — Gateway page (Clerk-only auth)
 *
 * The stable, public-facing front door for AI4U Little Engineer.
 * All auth is handled exclusively by Clerk.
 * No Supabase OAuth. No legacy Google handler.
 *
 * Entry paths:
 *   1. Sign In  -> /sign-in  (Clerk: Google + email magic link)
 *   2. Sign Up  -> /sign-up  (Clerk)
 *   3. Demo     -> /demo     (no auth required)
 */

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

// Map known error codes to human-readable messages
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  session_exchange_failed: "Sign-in failed: could not complete the session. Please try again.",
  unknown: "Sign-in encountered an unexpected error. Please try again.",
};

function AuthErrorBanner() {
  const params = useSearchParams();
  const authError = params.get("auth_error");
  if (!authError) return null;
  const message =
    AUTH_ERROR_MESSAGES[authError] ??
    `Sign-in error (${authError}). Please try again.`;
  return (
    <div className="rounded-lg bg-amber-900/40 border border-amber-700 px-4 py-3 text-amber-300 text-sm text-center">
      {message}
    </div>
  );
}

function GatewayContent() {
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
          href="/sign-in"
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

          {/* Auth error banner — shown when redirected back from callback with error */}
          <Suspense fallback={null}>
            <AuthErrorBanner />
          </Suspense>

          {/* Primary CTAs — Clerk only */}
          <div className="space-y-3">
            <Link
              href="/sign-in"
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
              Sign In to Launch App
            </Link>

            <Link
              href="/sign-up"
              className="w-full py-2.5 rounded-lg border border-steel-700 bg-steel-800 hover:bg-steel-750 text-steel-200 text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              Create Account
            </Link>
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

export default function GatewayPage() {
  return (
    <Suspense fallback={null}>
      <GatewayContent />
    </Suspense>
  );
}
