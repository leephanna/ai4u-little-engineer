/**
 * /admin/queue — Live job queue viewer
 *
 * Shows all jobs in the pipeline with status, family, user, and timing.
 * Auto-refreshes every 30 seconds via Next.js revalidation.
 *
 * Phase 4: Operator console
 */

import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export const metadata = { title: "Job Queue — Admin" };
export const revalidate = 30;

const STATUS_COLORS: Record<string, string> = {
  draft:             "bg-steel-700 text-steel-300",
  clarifying:        "bg-blue-900/50 text-blue-300",
  generating:        "bg-yellow-900/50 text-yellow-300",
  awaiting_approval: "bg-purple-900/50 text-purple-300",
  approved:          "bg-green-900/50 text-green-300",
  rejected:          "bg-red-900/50 text-red-300",
  printed:           "bg-teal-900/50 text-teal-300",
  failed:            "bg-red-900/70 text-red-200",
};

export default async function QueuePage() {
  const supabase = await createClient();

  const { data: jobs } = await supabase
    .from("jobs")
    .select("id, title, status, selected_family, user_id, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(200);

  const jobList = jobs ?? [];

  // Group by status
  const statusCounts: Record<string, number> = {};
  for (const j of jobList) {
    const s = (j.status as string) ?? "unknown";
    statusCounts[s] = (statusCounts[s] ?? 0) + 1;
  }

  const inFlight = jobList.filter((j) =>
    ["clarifying", "generating", "awaiting_approval"].includes(j.status as string)
  );
  const failed = jobList.filter((j) => j.status === "failed");

  return (
    <div className="min-h-screen bg-steel-900">
      <nav className="border-b border-steel-800 px-6 py-4 flex items-center gap-4">
        <Link href="/admin" className="text-steel-400 hover:text-steel-100 text-sm">
          ← Admin
        </Link>
        <span className="text-steel-600">/</span>
        <span className="text-steel-200 font-semibold text-sm">Job Queue</span>
      </nav>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-steel-100">Job Queue</h1>
          <span className="text-steel-500 text-xs">Auto-refreshes every 30s</span>
        </div>

        {/* Status summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Object.entries(statusCounts).map(([status, count]) => (
            <div key={status} className="card text-center py-3">
              <div className="text-2xl font-bold text-steel-100">{count}</div>
              <div className={`text-xs mt-1 px-2 py-0.5 rounded-full inline-block ${STATUS_COLORS[status] ?? "bg-steel-700 text-steel-400"}`}>
                {status.replace(/_/g, " ")}
              </div>
            </div>
          ))}
        </div>

        {/* In-flight jobs */}
        {inFlight.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-yellow-400 uppercase tracking-wide mb-3">
              In-Flight ({inFlight.length})
            </h2>
            <div className="card overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="border-b border-steel-800">
                  <tr className="text-steel-400 text-xs uppercase tracking-wide">
                    <th className="text-left px-4 py-3">Title</th>
                    <th className="text-left px-4 py-3">Family</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-left px-4 py-3">User</th>
                    <th className="text-left px-4 py-3">Age</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-steel-800">
                  {inFlight.map((j) => {
                    const ageMs = Date.now() - new Date(j.created_at as string).getTime();
                    const ageMin = Math.round(ageMs / 60000);
                    return (
                      <tr key={j.id as string} className="hover:bg-steel-800/30">
                        <td className="px-4 py-3 text-steel-200 max-w-xs truncate">
                          {(j.title as string | null) ?? "Untitled"}
                        </td>
                        <td className="px-4 py-3 text-steel-400 text-xs capitalize">
                          {(j.selected_family as string | null)?.replace(/_/g, " ") ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[j.status as string] ?? "bg-steel-700 text-steel-400"}`}>
                            {(j.status as string).replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-steel-500">
                          {(j.user_id as string).slice(0, 8)}…
                        </td>
                        <td className="px-4 py-3 text-steel-500 text-xs">
                          {ageMin}m ago
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Failed jobs */}
        {failed.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-red-400 uppercase tracking-wide mb-3">
              Failed ({failed.length})
            </h2>
            <div className="card overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="border-b border-steel-800">
                  <tr className="text-steel-400 text-xs uppercase tracking-wide">
                    <th className="text-left px-4 py-3">Title</th>
                    <th className="text-left px-4 py-3">Family</th>
                    <th className="text-left px-4 py-3">User</th>
                    <th className="text-left px-4 py-3">Failed At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-steel-800">
                  {failed.slice(0, 50).map((j) => (
                    <tr key={j.id as string} className="hover:bg-steel-800/30">
                      <td className="px-4 py-3 text-steel-200 max-w-xs truncate">
                        {(j.title as string | null) ?? "Untitled"}
                      </td>
                      <td className="px-4 py-3 text-steel-400 text-xs capitalize">
                        {(j.selected_family as string | null)?.replace(/_/g, " ") ?? "—"}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-steel-500">
                        {(j.user_id as string).slice(0, 8)}…
                      </td>
                      <td className="px-4 py-3 text-steel-500 text-xs">
                        {new Date(j.updated_at as string).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Full job list */}
        <section>
          <h2 className="text-sm font-semibold text-steel-400 uppercase tracking-wide mb-3">
            All Jobs (last 200)
          </h2>
          <div className="card overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-steel-800">
                <tr className="text-steel-400 text-xs uppercase tracking-wide">
                  <th className="text-left px-4 py-3">Title</th>
                  <th className="text-left px-4 py-3">Family</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">User</th>
                  <th className="text-left px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-800">
                {jobList.map((j) => (
                  <tr key={j.id as string} className="hover:bg-steel-800/30">
                    <td className="px-4 py-3 text-steel-200 max-w-xs truncate">
                      {(j.title as string | null) ?? "Untitled"}
                    </td>
                    <td className="px-4 py-3 text-steel-400 text-xs capitalize">
                      {(j.selected_family as string | null)?.replace(/_/g, " ") ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[j.status as string] ?? "bg-steel-700 text-steel-400"}`}>
                        {(j.status as string).replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-steel-500">
                      {(j.user_id as string).slice(0, 8)}…
                    </td>
                    <td className="px-4 py-3 text-steel-500 text-xs">
                      {new Date(j.created_at as string).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
