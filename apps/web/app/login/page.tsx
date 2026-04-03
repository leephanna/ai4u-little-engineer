"use client";

/**
 * /login
 *
 * Sign-in page with Google as the first-class option.
 * Email/password sign-in remains available as a secondary path.
 *
 * Google auth: Phase 3 addition — uses Supabase OAuth provider.
 */
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import GoogleSignInButton from "@/components/auth/GoogleSignInButton";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") || searchParams.get("redirect") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEmailForm, setShowEmailForm] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push(redirectTo);
      router.refresh();
    }
  }

  return (
    <div className="card space-y-4">
      {/* Google — primary CTA */}
      <GoogleSignInButton redirectTo={redirectTo} label="Continue with Google" />

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-steel-700" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-steel-800 px-3 text-steel-500">or sign in with email</span>
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
        <form onSubmit={handleLogin} className="space-y-4">
          {error && (
            <div className="bg-red-900/50 border border-red-700 rounded-lg px-4 py-3 text-red-300 text-sm">
              {error}
            </div>
          )}

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
              className="w-full bg-steel-900 border border-steel-700 rounded-lg px-3 py-2.5 text-steel-100 placeholder-steel-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full py-2.5 touch-target"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-steel-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-brand-600 rounded-xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-lg">AI</span>
          </div>
          <h1 className="text-2xl font-bold text-steel-100">Sign In</h1>
          <p className="text-steel-400 text-sm mt-1">AI4U Little Engineer</p>
        </div>

        {/* Form */}
        <Suspense fallback={<div className="card text-steel-400 text-center py-8">Loading...</div>}>
          <LoginForm />
        </Suspense>

        <p className="text-center text-steel-500 text-sm mt-6">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-brand-400 hover:text-brand-300">
            Sign up free
          </Link>
        </p>
      </div>
    </div>
  );
}
