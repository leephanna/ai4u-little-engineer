"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-steel-900 flex items-center justify-center px-4">
      <div className="card max-w-md w-full text-center py-12">
        <div className="text-5xl mb-4">⚠️</div>
        <h2 className="text-xl font-semibold text-steel-100 mb-2">
          Something went wrong
        </h2>
        <p className="text-steel-400 text-sm mb-6">
          {error.message || "An unexpected error occurred. Please try again."}
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="btn-primary"
          >
            Try Again
          </button>
          <Link href="/dashboard" className="btn-secondary">
            Go to Dashboard
          </Link>
        </div>
        {error.digest && (
          <p className="text-steel-600 text-xs mt-4">
            Error ID: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
