/**
 * /admin/intelligence/debates
 * List all Harmonia debate records with filter by status.
 */
import { createServiceClient } from "@/lib/supabase/service";
import Link from "next/link";

export default async function DebatesListPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  const supabase = createServiceClient();

  let query = supabase
    .from("intelligence_debates")
    .select("id, topic_type, final_recommendation, risk_score, novelty_score, total_tokens, estimated_cost_usd, operator_reviewed, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (filter === "pending") query = query.eq("operator_reviewed", false);
  else if (filter === "approved") query = query.eq("operator_decision", "approved");
  else if (filter === "rejected") query = query.eq("operator_decision", "rejected");

  const { data: debates } = await query;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-steel-100">AI Debates</h1>
          <p className="text-steel-400 text-sm mt-1">Multi-model governance decisions</p>
        </div>
        <Link href="/admin/intelligence" className="text-sm text-steel-400 hover:text-steel-200">
          ← Back to Intelligence Hub
        </Link>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {[
          { label: "All", value: undefined },
          { label: "Pending Review", value: "pending" },
          { label: "Approved", value: "approved" },
          { label: "Rejected", value: "rejected" },
        ].map((tab) => (
          <Link
            key={tab.label}
            href={tab.value ? `/admin/intelligence/debates?filter=${tab.value}` : "/admin/intelligence/debates"}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === tab.value
                ? "bg-brand-500 text-white"
                : "bg-steel-800 text-steel-400 hover:text-steel-200"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {/* Debates table */}
      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-steel-900/50 border-b border-steel-800">
            <tr>
              <th className="text-left px-4 py-3 text-steel-400 font-medium">Topic Type</th>
              <th className="text-left px-4 py-3 text-steel-400 font-medium">Recommendation</th>
              <th className="text-left px-4 py-3 text-steel-400 font-medium">Risk</th>
              <th className="text-left px-4 py-3 text-steel-400 font-medium">Novelty</th>
              <th className="text-left px-4 py-3 text-steel-400 font-medium">Tokens</th>
              <th className="text-left px-4 py-3 text-steel-400 font-medium">Status</th>
              <th className="text-left px-4 py-3 text-steel-400 font-medium">Date</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-steel-800">
            {(debates ?? []).map((d) => (
              <tr key={d.id as string} className="hover:bg-steel-800/30 transition-colors">
                <td className="px-4 py-3 font-mono text-xs text-steel-300">{d.topic_type as string}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                    d.final_recommendation === "approve_eval" ? "text-green-400" :
                    d.final_recommendation === "reject" ? "text-red-400" : "text-yellow-400"
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      d.final_recommendation === "approve_eval" ? "bg-green-400" :
                      d.final_recommendation === "reject" ? "bg-red-400" : "bg-yellow-400"
                    }`} />
                    {d.final_recommendation as string}
                  </span>
                </td>
                <td className="px-4 py-3 text-steel-300">{((d.risk_score as number) ?? 0).toFixed(2)}</td>
                <td className="px-4 py-3 text-steel-300">{((d.novelty_score as number) ?? 0).toFixed(2)}</td>
                <td className="px-4 py-3 text-steel-500">{(d.total_tokens as number)?.toLocaleString() ?? "—"}</td>
                <td className="px-4 py-3">
                  {d.operator_reviewed ? (
                    <span className="text-xs text-steel-500">Reviewed</span>
                  ) : (
                    <span className="text-xs bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full">Pending</span>
                  )}
                </td>
                <td className="px-4 py-3 text-steel-500 text-xs">
                  {new Date(d.created_at as string).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/intelligence/debates/${d.id}`}
                    className="text-xs text-brand-400 hover:text-brand-300"
                  >
                    View →
                  </Link>
                </td>
              </tr>
            ))}
            {(!debates || debates.length === 0) && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-steel-500">
                  No debates found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
