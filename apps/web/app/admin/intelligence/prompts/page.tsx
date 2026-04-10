/**
 * /admin/intelligence/prompts
 * List prompt versions with eval scores and promotion status.
 */
import { createServiceClient } from "@/lib/supabase/service";
import Link from "next/link";
import { PromptAction } from "./PromptAction";

export const dynamic = 'force-dynamic';

export default async function PromptsPage() {
  const supabase = createServiceClient();
  const { data: prompts } = await supabase
    .from("prompt_versions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(30);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-steel-100">Prompt Versions</h1>
          <p className="text-steel-400 text-sm mt-1">NLU prompt candidates and their eval history</p>
        </div>
        <Link href="/admin/intelligence" className="text-sm text-steel-400 hover:text-steel-200">
          ← Back
        </Link>
      </div>

      <div className="space-y-4">
        {(prompts ?? []).map((p) => (
          <div key={p.id as string} className="card">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-mono text-sm text-steel-200 font-semibold">
                    v{p.version as string}
                  </span>
                  <StatusBadge status={p.status as string} />
                  {p.eval_suite_version && (
                    <span className="text-xs text-steel-500 font-mono">eval {p.eval_suite_version as string}</span>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-2">
                  <div>
                    <p className="text-xs text-steel-500">Eval Score</p>
                    <p className={`font-medium ${
                      (p.eval_score as number) >= 0.8 ? "text-green-400" :
                      (p.eval_score as number) >= 0.6 ? "text-yellow-400" : "text-red-400"
                    }`}>
                      {p.eval_score != null ? `${(((p.eval_score as number)) * 100).toFixed(0)}%` : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-steel-500">Eval Passed</p>
                    <p className={p.eval_passed ? "text-green-400" : "text-steel-500"}>
                      {p.eval_passed == null ? "—" : p.eval_passed ? "Yes" : "No"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-steel-500">Regression Risk</p>
                    <p className="text-steel-200">
                      {p.regression_risk_score != null ? ((p.regression_risk_score as number) * 100).toFixed(0) + "%" : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-steel-500">Created</p>
                    <p className="text-steel-200">{new Date(p.created_at as string).toLocaleDateString()}</p>
                  </div>
                </div>
                {p.debate_id && (
                  <Link
                    href={`/admin/intelligence/debates/${p.debate_id}`}
                    className="text-xs text-brand-400 hover:text-brand-300"
                  >
                    View Harmonia Debate →
                  </Link>
                )}
              </div>
              {["candidate", "evaluating"].includes(p.status as string) && (
                <PromptAction promptId={p.id as string} />
              )}
            </div>
          </div>
        ))}
        {(!prompts || prompts.length === 0) && (
          <div className="card text-center text-steel-500 py-8">
            No prompt versions found.
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    candidate: "bg-amber-500/20 text-amber-300",
    evaluating: "bg-blue-500/20 text-blue-300",
    production: "bg-green-500/20 text-green-300",
    archived: "bg-steel-700/50 text-steel-500",
    rejected: "bg-red-500/20 text-red-300",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[status] ?? "bg-steel-700 text-steel-400"}`}>
      {status}
    </span>
  );
}
