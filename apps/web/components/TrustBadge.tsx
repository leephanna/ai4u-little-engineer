"use client";

/**
 * TrustBadge — Enhanced v2
 *
 * Displays the trust tier of a design on marketplace cards and design pages.
 * Trust tiers are assigned by the Trust Policy Engine after VPL evaluation.
 *
 * Enhancements (v2):
 *   - Full SVG icons per tier (shield-check, check-circle, warning, question)
 *   - Rich gradient color system
 *   - Hover tooltip with tier explanation
 *   - "Designed to Work — Verified by AI4U" tagline on md/lg size
 *   - lg size variant added
 *
 * Tiers:
 *   trusted_commercial — VPL grade A/B, marketplace-eligible (emerald shield)
 *   verified           — VPL grade A/B/C, library-eligible (blue checkmark)
 *   low_confidence     — VPL grade C/D, private use only (amber warning)
 *   unverified         — VPL missing or failed (steel question mark)
 */

import { useState } from "react";

interface TrustBadgeProps {
  trustTier: string | null;
  size?: "sm" | "md" | "lg";
  showTagline?: boolean;
}

function ShieldCheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function ExclamationTriangleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}

function QuestionMarkCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

const TIER_CONFIG: Record<
  string,
  {
    label: string;
    shortLabel: string;
    Icon: React.FC<{ className?: string }>;
    badgeClass: string;
    tooltip: string;
  }
> = {
  trusted_commercial: {
    label: "Verified Commercial",
    shortLabel: "Commercial",
    Icon: ShieldCheckIcon,
    badgeClass:
      "bg-gradient-to-r from-emerald-900/60 to-green-900/40 text-emerald-200 border border-emerald-700/60 shadow-sm",
    tooltip:
      "Grade A/B VPL score. Approved for commercial sale on the AI4U marketplace. Designed to Work — Verified by AI4U.",
  },
  verified: {
    label: "Verified",
    shortLabel: "Verified",
    Icon: CheckCircleIcon,
    badgeClass:
      "bg-gradient-to-r from-blue-900/60 to-indigo-900/40 text-blue-200 border border-blue-700/60 shadow-sm",
    tooltip:
      "Passed Virtual Print Lab validation. Available in the public library. Not yet approved for paid marketplace sales.",
  },
  low_confidence: {
    label: "Low Confidence",
    shortLabel: "Low Confidence",
    Icon: ExclamationTriangleIcon,
    badgeClass:
      "bg-gradient-to-r from-amber-900/60 to-yellow-900/40 text-amber-200 border border-amber-700/60 shadow-sm",
    tooltip:
      "Low VPL score. May print successfully but has not met the quality threshold for public distribution.",
  },
  unverified: {
    label: "Unverified",
    shortLabel: "Unverified",
    Icon: QuestionMarkCircleIcon,
    badgeClass:
      "bg-steel-800/60 text-steel-400 border border-steel-600/60",
    tooltip:
      "Not yet validated by the Virtual Print Lab. Print results may vary.",
  },
};

export function TrustBadge({
  trustTier,
  size = "sm",
  showTagline = false,
}: TrustBadgeProps) {
  const [tooltipVisible, setTooltipVisible] = useState(false);

  if (!trustTier) return null;

  const config = TIER_CONFIG[trustTier] ?? TIER_CONFIG["unverified"];
  const { Icon, label, shortLabel, badgeClass, tooltip } = config;

  const iconSize =
    size === "lg" ? "w-5 h-5" : size === "md" ? "w-4 h-4" : "w-3.5 h-3.5";
  const textSize =
    size === "lg"
      ? "text-sm font-semibold"
      : size === "md"
      ? "text-xs font-semibold"
      : "text-xs font-medium";
  const padding =
    size === "lg" ? "px-3 py-1.5" : size === "md" ? "px-2.5 py-1" : "px-2 py-0.5";
  const displayLabel = size === "sm" ? shortLabel : label;

  return (
    <div className="relative inline-flex flex-col gap-1">
      <button
        type="button"
        className={`inline-flex items-center gap-1.5 rounded-full ${padding} ${textSize} ${badgeClass} transition-opacity cursor-default`}
        onMouseEnter={() => setTooltipVisible(true)}
        onMouseLeave={() => setTooltipVisible(false)}
        onFocus={() => setTooltipVisible(true)}
        onBlur={() => setTooltipVisible(false)}
        aria-label={`Trust tier: ${label}. ${tooltip}`}
      >
        <Icon className={iconSize} />
        <span>{displayLabel}</span>
      </button>

      {showTagline && size !== "sm" && (
        <p className="text-xs text-steel-500 italic pl-1">
          Designed to Work — Verified by AI4U
        </p>
      )}

      {tooltipVisible && (
        <div
          className="absolute bottom-full left-0 mb-2 z-50 w-64 rounded-lg bg-steel-800 border border-steel-600 shadow-xl px-3 py-2.5 text-xs text-steel-300 leading-relaxed pointer-events-none"
          role="tooltip"
        >
          <div className="font-semibold text-steel-100 mb-1">{label}</div>
          <p>{tooltip}</p>
          <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-steel-600" />
        </div>
      )}
    </div>
  );
}

export default TrustBadge;
