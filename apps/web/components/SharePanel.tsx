"use client";

import { useState } from "react";

interface SharePanelProps {
  jobId: string;
  initialShared: boolean;
  initialToken: string | null;
}

export function SharePanel({ jobId, initialShared, initialToken }: SharePanelProps) {
  const [shared, setShared] = useState(initialShared);
  const [token, setToken] = useState<string | null>(initialToken);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareUrl = token
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/share/${token}`
    : null;

  async function toggleShare() {
    setLoading(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: shared ? "disable" : "enable" }),
      });
      const data = await res.json();
      if (res.ok) {
        setShared(data.shared);
        setToken(data.share_token);
      }
    } finally {
      setLoading(false);
    }
  }

  async function copyLink() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-steel-200">Share This Part</h3>
        <button
          onClick={toggleShare}
          disabled={loading}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            shared ? "bg-brand-600" : "bg-steel-600"
          } ${loading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
          aria-label={shared ? "Disable sharing" : "Enable sharing"}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              shared ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      {shared && shareUrl ? (
        <div className="space-y-3">
          <p className="text-xs text-steel-400">
            Anyone with this link can view the part spec and download files.
          </p>
          <div className="flex gap-2">
            <input
              readOnly
              value={shareUrl}
              className="flex-1 bg-steel-800 border border-steel-700 rounded-lg px-3 py-2 text-xs text-steel-300 font-mono truncate"
            />
            <button
              onClick={copyLink}
              className="btn-secondary text-xs py-2 px-3 flex-shrink-0"
            >
              {copied ? "✓ Copied" : "Copy"}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-steel-500">
          Enable sharing to generate a public link for this part.
        </p>
      )}
    </div>
  );
}
