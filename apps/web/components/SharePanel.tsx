"use client";

/**
 * SharePanel — Enhanced v2
 *
 * Extends the original share toggle with a visual ShareCard preview.
 * When sharing is enabled, shows:
 *   - Share link input + copy button (original)
 *   - "Share Preview" button that opens the visual ShareCard modal
 *
 * The ShareCard displays the design image, VPL score, trust tier, and brand
 * signature in a shareable visual format.
 */

import { useState } from "react";
import { ShareCard } from "./ShareCard";

interface SharePanelProps {
  jobId: string;
  initialShared: boolean;
  initialToken: string | null;
  // Optional enrichment props for the ShareCard
  jobTitle?: string;
  family?: string | null;
  vplScore?: number | null;
  vplGrade?: string | null;
  trustTier?: string | null;
  imageUrl?: string | null;
}

export function SharePanel({
  jobId,
  initialShared,
  initialToken,
  jobTitle,
  family,
  vplScore,
  vplGrade,
  trustTier,
  imageUrl,
}: SharePanelProps) {
  const [shared, setShared] = useState(initialShared);
  const [token, setToken] = useState<string | null>(initialToken);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showCard, setShowCard] = useState(false);

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
    <>
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

            {/* Share Preview Card button */}
            <button
              onClick={() => setShowCard(true)}
              className="w-full flex items-center justify-center gap-2 text-xs text-brand-400 hover:text-brand-300 transition-colors py-2 border border-brand-800/50 rounded-lg hover:border-brand-700 hover:bg-brand-900/20"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              Share Preview Card
            </button>
          </div>
        ) : (
          <p className="text-xs text-steel-500">
            Enable sharing to generate a public link for this part.
          </p>
        )}
      </div>

      {/* ShareCard modal */}
      {showCard && shareUrl && (
        <ShareCard
          title={jobTitle ?? "AI4U Design"}
          family={family}
          score={vplScore}
          grade={vplGrade}
          trustTier={trustTier}
          imageUrl={imageUrl}
          shareUrl={shareUrl}
          onClose={() => setShowCard(false)}
        />
      )}
    </>
  );
}
