"use client";

/**
 * /admin/unlock
 *
 * Fallback owner unlock page.
 *
 * This page is NOT protected by the admin role guard (it lives outside the
 * admin layout on purpose) so the owner can access it even when Google OAuth
 * is not yet configured.
 *
 * The page accepts the ADMIN_BYPASS_KEY and calls POST /api/admin/unlock,
 * which sets an HttpOnly bypass cookie granting unlimited access for 24 hours.
 *
 * The page is intentionally minimal and does not reveal any system internals.
 */
import { useState } from "react";
import Link from "next/link";

type Phase = "idle" | "loading" | "success" | "error";

export default function AdminUnlockPage() {
  const [key, setKey] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [clearPhase, setClearPhase] = useState<Phase>("idle");

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    setPhase("loading");
    setMessage(null);

    try {
      const res = await fetch("/api/admin/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setPhase("error");
        setMessage(data.error ?? "Unlock failed.");
      } else {
        setPhase("success");
        setMessage(data.message ?? "Owner bypass active.");
        setKey("");
      }
    } catch {
      setPhase("error");
      setMessage("Network error. Please try again.");
    }
  }

  async function handleClear() {
    setClearPhase("loading");
    try {
      const res = await fetch("/api/admin/unlock", { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setClearPhase("error");
      } else {
        setClearPhase("success");
        setMessage(data.message ?? "Bypass cookie cleared.");
        setPhase("idle");
      }
    } catch {
      setClearPhase("error");
    }
  }

  return (
    <div className="min-h-screen bg-steel-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-amber-600 rounded-xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-lg">🔑</span>
          </div>
          <h1 className="text-2xl font-bold text-steel-100">Owner Unlock</h1>
          <p className="text-steel-400 text-sm mt-1">
            Activate unlimited access for 24 hours
          </p>
        </div>

        {/* Unlock form */}
        <form onSubmit={handleUnlock} className="card space-y-4">
          {phase === "success" && (
            <div className="bg-green-900/50 border border-green-700 rounded-lg px-4 py-3 text-green-300 text-sm">
              {message}
            </div>
          )}
          {phase === "error" && (
            <div className="bg-red-900/50 border border-red-700 rounded-lg px-4 py-3 text-red-300 text-sm">
              {message}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-steel-300 mb-1.5">
              Admin Key
            </label>
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              required
              autoComplete="off"
              className="w-full bg-steel-900 border border-steel-700 rounded-lg px-3 py-2.5 text-steel-100 placeholder-steel-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              placeholder="Enter ADMIN_BYPASS_KEY"
            />
          </div>

          <button
            type="submit"
            disabled={phase === "loading"}
            className="w-full py-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {phase === "loading" ? "Activating…" : "Activate Unlimited Access"}
          </button>
        </form>

        {/* Clear cookie */}
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={handleClear}
            disabled={clearPhase === "loading"}
            className="text-xs text-steel-500 hover:text-steel-300 transition-colors"
          >
            {clearPhase === "loading"
              ? "Clearing…"
              : clearPhase === "success"
              ? "✓ Cookie cleared"
              : "Clear bypass cookie"}
          </button>
        </div>

        {/* Navigation */}
        <div className="mt-6 text-center">
          <Link href="/dashboard" className="text-xs text-brand-400 hover:text-brand-300">
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
