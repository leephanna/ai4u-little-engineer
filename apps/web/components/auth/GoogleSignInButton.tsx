"use client";

/**
 * GoogleSignInButton
 *
 * Triggers Supabase OAuth sign-in with Google provider.
 * Works for both new sign-up and returning sign-in — Google handles
 * the distinction transparently.
 *
 * Graceful degradation: if the Google provider is not yet enabled in Supabase
 * (returns "Unsupported provider" or similar), the button shows an actionable
 * message instead of a raw error string.
 *
 * Usage:
 *   <GoogleSignInButton redirectTo="/invent" />
 */
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Props {
  redirectTo?: string;
  label?: string;
  className?: string;
}

/** Human-readable messages for known Supabase OAuth error codes. */
function friendlyOAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (
    lower.includes("unsupported provider") ||
    lower.includes("provider is not enabled") ||
    lower.includes("provider not enabled")
  ) {
    return "Google sign-in is not yet configured. Please use email/password below, or contact the site owner.";
  }
  if (lower.includes("email already registered")) {
    return "An account with this email already exists. Try signing in instead.";
  }
  if (lower.includes("popup_closed") || lower.includes("popup closed")) {
    return "Sign-in window was closed. Please try again.";
  }
  return message;
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

    const supabase = createClient();
    // Use the canonical production URL from the env var so the redirectTo value
    // is always in Supabase's allowed list, regardless of which Vercel preview
    // URL the user arrived on.
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ??
      (typeof window !== "undefined" ? window.location.origin : "");
    const callbackUrl = `${appUrl}/auth/callback?next=${encodeURIComponent(redirectTo)}`;

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callbackUrl,
        queryParams: {
          // Request offline access to get a refresh token
          access_type: "offline",
          // Force account selection on every sign-in for clarity
          prompt: "select_account",
        },
      },
    });

    if (oauthError) {
      setError(friendlyOAuthError(oauthError.message));
      setLoading(false);
    }
    // On success, Supabase redirects the browser to Google — no further action needed here.
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
