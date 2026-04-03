"use client";

/**
 * /signup
 *
 * Account creation page with Google as the first-class option.
 * Email/password sign-up remains available as a secondary path.
 *
 * Google auth: Phase 3 addition — uses Supabase OAuth provider.
 */
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import GoogleSignInButton from "@/components/auth/GoogleSignInButton";
import { Suspense } from "react";

function SignupForm() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") || searchParams.get("redirect") || "/dashboard";

  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setSuccess(true);
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="text-center">
        <div className="w-16 h-16 bg-green-900 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-green-400 text-2xl">✓</span>
        </div>
        <h2 className="text-xl font-bold text-steel-100 mb-2">Check your email</h2>
        <p className="text-steel-400 text-sm">
          We sent a confirmation link to <strong className="text-steel-200">{email}</strong>.
          Click it to activate your account.
        </p>
        <Link href="/login" className="btn-secondary mt-6 inline-block">
          Back to Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="card space-y-4">
      {/* Google — primary CTA */}
      <GoogleSignInButton redirectTo={redirectTo} label="Sign up with Google" />

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-steel-700" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-steel-800 px-3 text-steel-500">or create account with email</span>
        </div>
      </div>

      {/* Email/password — secondary path */}
      {!showEmailForm ? (
        <button
          type="button"
          onClick={() => setShowEmailForm(true)}
          className="w-full text-center text-xs text-steel-500 hover:text-steel-300 transition-colors py-1"
        >
          Use email + password instead →
        </button>
      ) : (
        <form onSubmit={handleSignup} className="space-y-4">
          {error && (
            <div className="bg-red-900/50 border border-red-700 rounded-lg px-4 py-3 text-red-300 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-steel-300 mb-1.5">
              Full Name
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className="w-full bg-steel-900 border border-steel-700 rounded-lg px-3 py-2.5 text-steel-100 placeholder-steel-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              placeholder="Your name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-steel-300 mb-1.5">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-steel-900 border border-steel-700 rounded-lg px-3 py-2.5 text-steel-100 placeholder-steel-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-steel-300 mb-1.5">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full bg-steel-900 border border-steel-700 rounded-lg px-3 py-2.5 text-steel-100 placeholder-steel-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              placeholder="Min. 8 characters"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full py-2.5 touch-target"
          >
            {loading ? "Creating account..." : "Create Account"}
          </button>
        </form>
      )}
    </div>
  );
}

export default function SignupPage() {
  return (
    <div className="min-h-screen bg-steel-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-brand-600 rounded-xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-lg">AI</span>
          </div>
          <h1 className="text-2xl font-bold text-steel-100">Create Account</h1>
          <p className="text-steel-400 text-sm mt-1">AI4U Little Engineer</p>
        </div>

        <Suspense fallback={<div className="card text-steel-400 text-center py-8">Loading...</div>}>
          <SignupForm />
        </Suspense>

        <p className="text-center text-steel-500 text-sm mt-6">
          Already have an account?{" "}
          <Link href="/login" className="text-brand-400 hover:text-brand-300">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
