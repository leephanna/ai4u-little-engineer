"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const supabase = createClient();

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
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
      <div className="min-h-screen bg-steel-900 flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
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
      </div>
    );
  }

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

        <form onSubmit={handleSignup} className="card space-y-4">
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
