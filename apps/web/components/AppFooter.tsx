import Link from "next/link";

/**
 * AppFooter
 *
 * Minimal footer with legal links, copyright notice, and brand signature.
 * Rendered on public-facing pages (marketplace, share, terms).
 */
export function AppFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-steel-800 mt-12 px-4 py-6">
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-steel-600">
        <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-3">
          <span className="font-semibold text-indigo-400 tracking-widest uppercase">AI4U</span>
          <span className="hidden sm:inline text-steel-700">·</span>
          <span>© {year} AI4U, LLC. AI4Utech.com, Lee Hanna-Owner. All rights reserved.</span>
        </div>
        <nav className="flex items-center gap-4">
          <Link href="/terms" className="hover:text-steel-400 transition-colors">
            Terms of Use
          </Link>
          <Link href="/marketplace/license" className="hover:text-steel-400 transition-colors">
            Marketplace License
          </Link>
          <Link href="/marketplace" className="hover:text-steel-400 transition-colors">
            Marketplace
          </Link>
        </nav>
      </div>
    </footer>
  );
}

export default AppFooter;
