/**
 * /admin/intelligence/tolerance
 * List tolerance insights with approve/reject actions.
 */
import { createServiceClient } from "@/lib/supabase/service";
import Link from "next/link";
import { ToleranceAction } from "./ToleranceAction";

export default async function TolerancePage() {
  const supabase = createServiceClient();
  const { data: insights } = await supabase
    .from("tolerance_insights")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-steel-100">Tolerance Insights</h1>
          <p className="text-steel-400 text-sm mt-1">Dimensional adjustment proposals from print feedback</p>
        </div>
        <Link href="/admin/intelligence" className="text-sm text-steel-400 hover:text-steel-200">
          ← Back
        </Link>
      </div>

      <div className="space-y-4">
        {(insights ?? []).map((insight) => (
          <div key={insight.id as string} className="card">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-mono text-sm text-steel-200 font-semibold">
                    {insight.family as string}.{insight.dimension_name as string}
                  </span>
                  <StatusBadge status={insight.status as string} />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-steel-500">Adjustment</p>
                    <p className="text-steel-200 font-medium">
                      {(insight.suggested_adjustment as number) > 0 ? "+" : ""}
                      {insight.suggested_adjustment as number} {insight.adjustment_unit as string}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-steel-500">Confidence</p>
                    <p className="text-steel-200">{(((insight.confidence_score as number) ?? 0) * 100).toFixed(0)}%</p>
                  </div>
                  <div>
                    <p className="text-xs text-steel-500">Evidence</p>
                    <p className="text-steel-200">{insight.evidence_count as number} prints</p>
                  </div>
                  <div>
                    <p className="text-xs text-steel-500">Date</p>
                    <p className="text-steel-200">{new Date(insight.created_at as string).toLocaleDateString()}</p>
                  </div>
                </div>
                {insight.condition_context && Object.keys(insight.condition_context as object).length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-steel-500">Conditions</p>
                    <p className="text-xs text-steel-400 font-mono">
                      {JSON.stringify(insight.condition_context)}
                    </p>
                  </div>
                )}
              </div>
              {(insight.status as string) === "proposed" && (
                <ToleranceAction insightId={insight.id as string} />
              )}
            </div>
          </div>
        ))}
        {(!insights || insights.length === 0) && (
          <div className="card text-center text-steel-500 py-8">
            No tolerance insights yet. Run the tolerance-insight-proposer task to generate them.
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    proposed: "bg-amber-500/20 text-amber-300",
    evaluating: "bg-blue-500/20 text-blue-300",
    approved: "bg-green-500/20 text-green-300",
    rejected: "bg-red-500/20 text-red-300",
    active: "bg-purple-500/20 text-purple-300",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[status] ?? "bg-steel-700 text-steel-400"}`}>
      {status}
    </span>
  );
}
