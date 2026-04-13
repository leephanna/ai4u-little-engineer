"use client";

// Legacy GoogleSignInButton — replaced by Clerk auth.
// Clerk's <SignIn /> component handles Google OAuth natively.
// This stub is kept to avoid breaking any remaining import references.
interface Props {
  redirectTo?: string;
  label?: string;
  className?: string;
}

export default function GoogleSignInButton({ label = "Continue with Google", className }: Props) {
  return (
    <a
      href="/sign-in"
      className={className ?? "w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-lg bg-steel-800 hover:bg-steel-750 border border-steel-700 text-steel-400 hover:text-steel-200 font-medium text-sm transition-colors"}
    >
      {label}
    </a>
  );
}
