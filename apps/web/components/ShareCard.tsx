"use client";

/**
 * ShareCard
 *
 * A visually rich preview card for sharing a design on social media or messaging.
 * Displays:
 *   - Project image (AI-generated render, if available)
 *   - Design title and family
 *   - VPL score and grade badge
 *   - Trust tier badge
 *   - Brand signature
 *   - Share URL
 *
 * The card is rendered as a DOM element and can be screenshotted by the browser
 * for native share or clipboard copy.
 *
 * Usage:
 *   <ShareCard
 *     title="Cable Clip"
 *     family="cable_clip"
 *     score={88}
 *     grade="A"
 *     trustTier="trusted_commercial"
 *     imageUrl="https://..."
 *     shareUrl="https://ai4u.app/share/abc123"
 *   />
 */

import { useRef, useState } from "react";
import Image from "next/image";
import { TrustBadge } from "./TrustBadge";
import { VplGradeBadge } from "./VplGradeBadge";
import { BrandSignatureBlock } from "./BrandSignatureBlock";

interface ShareCardProps {
  title: string;
  family?: string | null;
  score?: number | null;
  grade?: string | null;
  trustTier?: string | null;
  imageUrl?: string | null;
  shareUrl: string;
  onClose?: () => void;
}

export function ShareCard({
  title,
  family,
  score,
  grade,
  trustTier,
  imageUrl,
  shareUrl,
  onClose,
}: ShareCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);

  const familyLabel = family?.replace(/_/g, " ") ?? "3D Design";

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select text
    }
  }

  async function nativeShare() {
    if (!navigator.share) return;
    setSharing(true);
    try {
      await navigator.share({
        title: `${title} — AI4U Little Engineer`,
        text: `Check out this AI-generated 3D design: ${title}${grade ? ` (VPL Grade ${grade})` : ""}. Designed to Work — Verified by AI4U.`,
        url: shareUrl,
      });
    } catch {
      // User cancelled or share failed
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm space-y-3">
        {/* The visual card itself */}
        <div
          ref={cardRef}
          className="rounded-2xl overflow-hidden bg-gradient-to-br from-steel-900 via-steel-800 to-steel-900 border border-steel-700 shadow-2xl"
        >
          {/* Image area */}
          <div className="relative aspect-video bg-steel-800">
            {imageUrl ? (
              <Image
                src={imageUrl}
                alt={title}
                fill
                className="object-cover"
                sizes="400px"
                unoptimized
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                <div className="text-5xl opacity-20">🔧</div>
                <span className="text-steel-600 text-sm capitalize">{familyLabel}</span>
              </div>
            )}
            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-steel-900/90 via-transparent to-transparent" />
            {/* Trust badge overlay */}
            {trustTier && (
              <div className="absolute top-3 right-3">
                <TrustBadge trustTier={trustTier} size="sm" />
              </div>
            )}
          </div>

          {/* Card body */}
          <div className="px-4 py-4 space-y-3">
            {/* Title + family */}
            <div>
              <h3 className="font-bold text-steel-100 text-lg leading-tight">{title}</h3>
              <p className="text-steel-400 text-sm capitalize mt-0.5">{familyLabel}</p>
            </div>

            {/* Badges row */}
            <div className="flex items-center gap-2 flex-wrap">
              {score != null && grade && (
                <VplGradeBadge score={score} grade={grade} size="md" />
              )}
              {trustTier && (
                <TrustBadge trustTier={trustTier} size="md" />
              )}
            </div>

            {/* Brand signature */}
            <div className="border-t border-steel-700/50 pt-3">
              <BrandSignatureBlock variant="compact" />
            </div>

            {/* URL */}
            <div className="bg-steel-800/60 rounded-lg px-3 py-2 flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-steel-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              <span className="text-xs text-steel-400 truncate font-mono">{shareUrl}</span>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={copyLink}
            className="flex-1 btn-secondary text-sm py-2.5 flex items-center justify-center gap-2"
          >
            {copied ? (
              <>
                <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copy Link
              </>
            )}
          </button>

          {typeof navigator !== "undefined" && "share" in navigator && (
            <button
              onClick={nativeShare}
              disabled={sharing}
              className="flex-1 btn-primary text-sm py-2.5 flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              {sharing ? "Sharing…" : "Share"}
            </button>
          )}
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="w-full text-sm text-steel-500 hover:text-steel-300 transition-colors py-1"
        >
          Close
        </button>
      </div>
    </div>
  );
}

export default ShareCard;
