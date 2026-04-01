"use client";

/**
 * TrustBadge
 *
 * Displays the trust tier of a design on marketplace cards and design pages.
 * Trust tiers are assigned by the Trust Policy Engine after VPL evaluation.
 *
 * Tiers:
 *   trusted_commercial — VPL grade A/B, marketplace-eligible (green shield)
 *   verified           — VPL grade A/B/C, library-eligible (blue checkmark)
 *   low_confidence     — VPL grade C/D, private use only (yellow warning)
 *   unverified         — VPL missing or failed (gray, not shown on marketplace)
 */

interface TrustBadgeProps {
  trustTier: string | null;
  size?: "sm" | "md";
}

const TIER_CONFIG: Record<
  string,
  { label: string; icon: string; className: string }
> = {
  trusted_commercial: {
    label: "Verified Commercial",
    icon: "🛡",
    className: "bg-green-100 text-green-800 border border-green-200",
  },
  verified: {
    label: "Verified",
    icon: "✓",
    className: "bg-blue-100 text-blue-800 border border-blue-200",
  },
  low_confidence: {
    label: "Low Confidence",
    icon: "⚠",
    className: "bg-yellow-100 text-yellow-800 border border-yellow-200",
  },
  unverified: {
    label: "Unverified",
    icon: "?",
    className: "bg-gray-100 text-gray-500 border border-gray-200",
  },
};

export function TrustBadge({ trustTier, size = "sm" }: TrustBadgeProps) {
  if (!trustTier) return null;

  const config = TIER_CONFIG[trustTier] ?? TIER_CONFIG["unverified"];
  const sizeClass = size === "md" ? "px-2.5 py-1 text-sm" : "px-2 py-0.5 text-xs";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded font-medium ${sizeClass} ${config.className}`}
      title={`Trust tier: ${trustTier}`}
    >
      <span aria-hidden="true">{config.icon}</span>
      {config.label}
    </span>
  );
}

export default TrustBadge;
