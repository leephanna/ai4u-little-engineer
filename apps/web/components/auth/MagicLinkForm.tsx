"use client";

// Legacy MagicLinkForm — replaced by Clerk auth.
// Clerk's <SignIn /> component handles email magic links natively.
// This stub is kept to avoid breaking any remaining import references.

export default function MagicLinkForm(_props: {
  redirectTo?: string;
  onSuccess?: () => void;
}) {
  return (
    <div className="text-center space-y-3">
      <p className="text-steel-300 text-sm">
        Sign in with email or Google via our secure auth page.
      </p>
      <a
        href="/sign-in"
        className="btn-primary w-full py-2.5 touch-target inline-block text-center"
      >
        Sign In
      </a>
    </div>
  );
}
