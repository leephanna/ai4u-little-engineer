"use client";

/**
 * AppHeader
 *
 * Persistent app header rendered on all pages via layout.tsx.
 * - Brand: "AI4U Little Engineer" (top left, links to /little-engineer)
 * - Nav links (signed-in only): My Jobs → /jobs, Gallery → /gallery
 * - Sign Out button (signed-in only) via Clerk's SignOutButton
 * - Sign In link (signed-out only) → /sign-in
 * - Dark theme: bg-steel-900, ~56px height
 * - ClerkProvider must be the outermost wrapper in layout.tsx
 */

import Link from "next/link";
import { SignedIn, SignedOut, SignOutButton } from "@clerk/nextjs";

export function AppHeader() {
  return (
    <header className="w-full bg-steel-900 border-b border-steel-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        {/* Brand */}
        <Link
          href="/little-engineer"
          className="flex items-center gap-2 group"
          aria-label="AI4U Little Engineer home"
        >
          {/* Gear icon */}
          <svg
            className="w-6 h-6 text-indigo-400 group-hover:text-indigo-300 transition-colors"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
            />
          </svg>
          <span className="font-semibold text-steel-50 group-hover:text-white transition-colors text-sm sm:text-base tracking-tight">
            AI4U <span className="text-indigo-400">Little Engineer</span>
          </span>
        </Link>

        {/* Nav */}
        <nav className="flex items-center gap-1 sm:gap-2">
          <SignedIn>
            <Link
              href="/invent"
              className="px-3 py-1.5 text-sm text-steel-300 hover:text-white hover:bg-steel-800 rounded-md transition-colors"
            >
              Invent
            </Link>
            <Link
              href="/jobs"
              className="px-3 py-1.5 text-sm text-steel-300 hover:text-white hover:bg-steel-800 rounded-md transition-colors"
            >
              My Jobs
            </Link>
            <Link
              href="/gallery"
              className="px-3 py-1.5 text-sm text-steel-300 hover:text-white hover:bg-steel-800 rounded-md transition-colors"
            >
              Gallery
            </Link>
            <SignOutButton redirectUrl="/little-engineer">
              <button className="ml-2 px-3 py-1.5 text-sm text-steel-400 hover:text-white hover:bg-steel-800 rounded-md transition-colors border border-steel-700 hover:border-steel-600">
                Sign Out
              </button>
            </SignOutButton>
          </SignedIn>

          <SignedOut>
            <Link
              href="/sign-in"
              className="px-3 py-1.5 text-sm text-indigo-400 hover:text-indigo-300 hover:bg-steel-800 rounded-md transition-colors border border-indigo-800 hover:border-indigo-700"
            >
              Sign In
            </Link>
          </SignedOut>
        </nav>
      </div>
    </header>
  );
}

export default AppHeader;
