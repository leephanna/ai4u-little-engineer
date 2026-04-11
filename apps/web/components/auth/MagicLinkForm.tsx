"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Props {
  redirectTo?: string;
  onSuccess?: () => void;
}

export default function MagicLinkForm({ redirectTo = "/invent", onSuccess }: Props) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (typeof window !== "undefined" ? window.location.origin : "");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${appUrl}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
        shouldCreateUser: true,
      },
    });

    if (otpError) {
      // Surface specific errors rather than generic failure text
      if (otpError.message.includes("rate limit")) {
        setError("Too many requests. Please wait a minute before trying again.");
      } else if (otpError.message.includes("invalid")) {
        setError("That email address doesn't look right. Please check and try again.");
      } else {
        setError(otpError.message);
      }
      setLoading(false);
    } else {
      setSent(true);
      setLoading(false);
      onSuccess?.();
    }
  }

  if (sent) {
    return (
      <div className="text-center space-y-3">
        <div className="w-12 h-12 bg-brand-600/20 border border-brand-500/40 rounded-full flex items-center justify-center mx-auto">
          <svg
            className="w-6 h-6 text-brand-400"
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
        </div>
        <p className="text-steel-100 font-medium">Check your email</p>
        <p className="text-steel-400 text-sm">
          We sent a secure sign-in link to{" "}
          <span className="text-brand-400 font-medium">{email}</span>.
          Click it to access AI4U Little Engineer.
        </p>
        <p className="text-steel-600 text-xs">
          Didn&apos;t receive it? Check your spam folder or{" "}
          <button
            type="button"
            onClick={() => { setSent(false); setEmail(""); }}
            className="text-brand-400 hover:text-brand-300 underline"
          >
            try again
          </button>
          .
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && (
        <div className="bg-red-900/40 border border-red-700/60 rounded-lg px-4 py-3 text-red-300 text-sm">
          {error}
        </div>
      )}
      <div>
        <label
          htmlFor="magic-link-email"
          className="block text-sm font-medium text-steel-300 mb-1.5"
        >
          Email address
        </label>
        <input
          id="magic-link-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={loading}
          className="w-full bg-steel-900 border border-steel-700 rounded-lg px-3 py-2.5 text-steel-100 placeholder-steel-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent disabled:opacity-60"
          placeholder="you@example.com"
          autoComplete="email"
        />
      </div>
      <button
        type="submit"
        disabled={loading || !email}
        className="btn-primary w-full py-2.5 touch-target disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading ? "Sending…" : "Send Magic Link"}
      </button>
    </form>
  );
}
