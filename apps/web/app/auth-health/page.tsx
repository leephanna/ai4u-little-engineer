import { auth, currentUser } from "@clerk/nextjs/server";
import { headers } from "next/headers";

const CANONICAL_SUPABASE_REF = "lphtdosxneplxgkygjom";
const CANONICAL_SUPABASE_URL = `https://${CANONICAL_SUPABASE_REF}.supabase.co`;

export default async function AuthHealthPage() {
  const { userId } = auth();
  const user = userId ? await currentUser() : null;
  const headersList = headers();
  const host = headersList.get("host") ?? "";
  const xForwardedFor = headersList.get("x-forwarded-for") ?? "";

  const isAuthenticated = !!userId;
  const email = user?.emailAddresses?.[0]?.emailAddress ?? null;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "(not set)";
  const supabaseRef = supabaseUrl.replace("https://", "").replace(".supabase.co", "");
  const supabaseMatch = supabaseRef === CANONICAL_SUPABASE_REF;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 font-mono p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-2 text-white">
          Auth Health Check
        </h1>
        <p className="text-gray-500 text-sm mb-8">
          Internal debug page — not linked from any public route.
        </p>

        <div className="space-y-4">
          {/* Auth status */}
          <Row
            label="Authenticated"
            value={isAuthenticated ? "YES" : "NO"}
            ok={isAuthenticated}
          />

          {/* Clerk user ID */}
          <Row
            label="Clerk User ID"
            value={userId ?? "(not signed in)"}
            ok={!!userId}
          />

          {/* Email */}
          <Row
            label="User Email"
            value={email ?? "(not signed in)"}
            ok={!!email}
          />

          {/* Current route */}
          <Row
            label="Current Route"
            value="/auth-health"
            ok={true}
          />

          {/* Post-login redirect */}
          <Row
            label="Post-Login Redirect"
            value={process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL ?? "/invent"}
            ok={true}
          />

          {/* Supabase project ref */}
          <Row
            label="Supabase URL"
            value={supabaseUrl}
            ok={supabaseMatch}
            detail={
              supabaseMatch
                ? `✓ matches canonical ref (${CANONICAL_SUPABASE_REF})`
                : `✗ MISMATCH — expected ${CANONICAL_SUPABASE_URL}`
            }
          />

          {/* Host */}
          <Row
            label="Host"
            value={host}
            ok={true}
          />

          {/* IP */}
          {xForwardedFor && (
            <Row
              label="X-Forwarded-For"
              value={xForwardedFor}
              ok={true}
            />
          )}
        </div>

        {/* Sign-in / sign-out links */}
        <div className="mt-10 flex gap-4 text-sm">
          {isAuthenticated ? (
            <a
              href="/api/auth/signout"
              className="px-4 py-2 bg-red-800 hover:bg-red-700 rounded text-white"
            >
              Sign Out
            </a>
          ) : (
            <a
              href="/sign-in"
              className="px-4 py-2 bg-indigo-700 hover:bg-indigo-600 rounded text-white"
            >
              Sign In
            </a>
          )}
          <a
            href="/invent"
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded text-white"
          >
            Go to /invent
          </a>
        </div>

        <p className="mt-8 text-xs text-gray-600">
          AI4U Little Engineer — auth-stable-clerk-cutover-working
        </p>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  ok,
  detail,
}: {
  label: string;
  value: string;
  ok: boolean;
  detail?: string;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 border border-gray-800 rounded p-3">
      <span className="w-48 shrink-0 text-gray-400 text-sm">{label}</span>
      <div className="flex-1">
        <span
          className={`text-sm font-semibold ${
            ok ? "text-green-400" : "text-red-400"
          }`}
        >
          {value}
        </span>
        {detail && (
          <p className={`text-xs mt-1 ${ok ? "text-green-600" : "text-red-500"}`}>
            {detail}
          </p>
        )}
      </div>
      <span className="text-lg">{ok ? "✅" : "❌"}</span>
    </div>
  );
}
