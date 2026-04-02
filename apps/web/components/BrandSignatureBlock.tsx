"use client";

/**
 * BrandSignatureBlock
 *
 * Displays the AI4U brand authority signature on result cards, share pages,
 * and marketplace listings. Communicates three pillars of trust:
 *   1. "Engineered by AI4U"       — origin authority
 *   2. "Validated by VPL"         — quality assurance
 *   3. "Protected by KeyGuardian" — security assurance
 *
 * Usage:
 *   <BrandSignatureBlock />                    — full horizontal (default)
 *   <BrandSignatureBlock variant="compact" />  — single line, space-constrained
 *   <BrandSignatureBlock variant="vertical" /> — stacked, for sidebars
 */

interface BrandSignatureBlockProps {
  variant?: "full" | "compact" | "vertical";
  className?: string;
  showTagline?: boolean;
}

const PILLARS = [
  {
    icon: (
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
    label: "Engineered by AI4U",
    color: "text-indigo-400",
  },
  {
    icon: (
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    label: "Validated by VPL",
    color: "text-emerald-400",
  },
  {
    icon: (
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    label: "Protected by KeyGuardian",
    color: "text-sky-400",
  },
];

export function BrandSignatureBlock({
  variant = "full",
  className = "",
  showTagline = false,
}: BrandSignatureBlockProps) {
  if (variant === "compact") {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <span className="text-xs font-bold tracking-widest text-indigo-400 uppercase">AI4U</span>
        <span className="text-steel-600 text-xs">·</span>
        {PILLARS.map((p) => (
          <span key={p.label} className={`flex items-center gap-0.5 text-xs ${p.color}`} title={p.label}>
            {p.icon}
          </span>
        ))}
      </div>
    );
  }

  if (variant === "vertical") {
    return (
      <div className={`flex flex-col gap-1.5 ${className}`}>
        <span className="text-xs font-bold tracking-widest text-indigo-400 uppercase mb-0.5">AI4U</span>
        {PILLARS.map((p) => (
          <span key={p.label} className={`flex items-center gap-1.5 text-xs ${p.color}`}>
            {p.icon}
            <span>{p.label}</span>
          </span>
        ))}
        {showTagline && (
          <p className="text-xs text-steel-500 mt-1 italic">Designed to Work — Verified by AI4U</p>
        )}
      </div>
    );
  }

  // full (default)
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-bold tracking-widest text-indigo-400 uppercase">AI4U</span>
        <span className="text-steel-700 text-xs hidden sm:inline">|</span>
        {PILLARS.map((p, i) => (
          <span key={p.label} className={`flex items-center gap-1 text-xs ${p.color}`}>
            {p.icon}
            <span>{p.label}</span>
            {i < PILLARS.length - 1 && (
              <span className="text-steel-700 ml-2 hidden sm:inline">·</span>
            )}
          </span>
        ))}
      </div>
      {showTagline && (
        <p className="text-xs text-steel-500 italic">Designed to Work — Verified by AI4U</p>
      )}
    </div>
  );
}

export default BrandSignatureBlock;
