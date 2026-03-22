import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-steel-900 flex items-center justify-center px-4">
      <div className="card max-w-md w-full text-center py-12">
        <div className="text-6xl mb-4">🔍</div>
        <h2 className="text-2xl font-bold text-steel-100 mb-2">404 — Not Found</h2>
        <p className="text-steel-400 text-sm mb-8">
          The page you are looking for does not exist or has been moved.
        </p>
        <Link href="/dashboard" className="btn-primary">
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
