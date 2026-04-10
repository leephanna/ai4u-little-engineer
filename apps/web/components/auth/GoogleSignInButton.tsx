"use client";

/**
 * GoogleSignInButton
 *
 * Triggers Google OAuth by redirecting directly to Supabase's /auth/v1/authorize
 * endpoint — bypassing the Supabase JS client OAuth helper entirely.
 *
 * Why: supabase.auth.signInWithOAuth() appends ?flowName=GeneralOAuthFlow to the
 * callback URL, producing a malformed redirect_uri that Google rejects with Error 400.
 * Building the URL manually sends the clean callback URL that matches Google's
 * Authorized Redirect URIs list exactly.
 *
 * Works for both new sign-up and returning sign-in — Google handles the distinction
 * transparently.
 *
 * Usage:
 *   <GoogleSignInButton redirectTo="/invent" />
 */
import { useState } from "react";

interface Props {
  redirectTo?: string;
  label?: string;
  className?: string;
}

export default function GoogleSignInButton({
  redirectTo = "/invent",
  label = "Continue with Google",
  className,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGoogleSignIn() {
    setLoading(true);
    setError(null);

    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!supabaseUrl) {
        throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured.");
      }

      // Use the canonical production URL so the redirect_to value always
      // matches an entry in Supabase's allowed list, regardless of which
      // Vercel preview URL the user arrived on.
      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL ??
        (typeof window !== "undefined" ? window.location.origin : "");

      const redirectTo_ = `${appUrl}/auth/callback?next=${encodeURIComponent(redirectTo)}`;

      // Build the Supabase OAuth URL directly — no PKCE, no flowName suffix.
      // This sends exactly: https://<project>.supabase.co/auth/v1/callback
      // as the redirect_uri to Google, matching the Authorized Redirect URI.
      const params = new URLSearchParams({
        provider: "google",
        redirect_to: redirectTo_,
      });

      window.location.href = `${supabaseUrl}/auth/v1/authorize?${params.toString()}`;
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Sign-in failed. Please try again.";
      setError(message);
      setLoading(false);
    }
  }

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={loading}
        className={
          className ??
          "w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-lg bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 font-medium text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        }
      >
        {/* Google "G" logo */}
        <svg
          width="18"
          height="18"
          viewBox="0 0 18 18"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
            fill="#4285F4"
          />
          <path
            d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
            fill="#34A853"
          />
          <path
            d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
            fill="#FBBC05"
          />
          <path
            d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
            fill="#EA4335"
          />
        </svg>
        {loading ? "Redirecting to Google…" : label}
      </button>
      {error && (
        <p className="mt-2 text-sm text-amber-600 text-center bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          {error}
        </p>
      )}
    </div>
  );
}
