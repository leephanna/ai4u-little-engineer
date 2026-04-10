/**
 * /admin/intelligence
 * Harmonia Phase 2 — Operator Review Console Hub
 *
 * Lists all intelligence subsystems with pending counts.
 */
import { createServiceClient } from "@/lib/supabase/service";
import Link from "next/link";

export const dynamic = 'force-dynamic';

async function getIntelligenceSummary() {
  const supabase = createServiceClient();
  const [debates, tolerance, capabilities, prompts] = await Promise.all([
    supabase.from("intelligence_debates").select("id, final_recommendation, created_at", { count: "exact" })
      .eq("operator_reviewed", false).limit(1),
    supabase.from("tolerance_insights").select("id", { count: "exact" })
      .eq("status", "proposed").limit(1),
    supabase.from("capability_candidates").select("id", { count: "exact" })
      .eq("status", "proposed").limit(1),
    supabase.from("prompt_versions").select("id", { count: "exact" })
      .in("status", ["candidate", "evaluating"]).limit(1),
  ]);
  return {
    pendingDebates: debates.count ?? 0,
    pendingTolerance: tolerance.count ?? 0,
    pendingCapabilities: capabilities.count ?? 0,
    pendingPrompts: prompts.count ?? 0,
  };
}

export default async function IntelligenceHubPage() {
  const summary = await getIntelligenceSummary();
  const totalPending =
    summary.pendingDebates +
    summary.pendingTolerance +
    summary.pendingCapabilities +
    summary.pendingPrompts;

  const sections = [
    {
      href: "/admin/intelligence/debates",
      icon: "🤝",
      title: "AI Debates",
      description: "Multi-model governance debates (Proposer → Critic → Judge)",
      pending: summary.pendingDebates,
      color: "border-purple-500/30 hover:border-purple-400/60",
    },
    {
      href: "/admin/intelligence/tolerance",
      icon: "📐",
      title: "Tolerance Insights",
      description: "Dimensional adjustment proposals from print feedback",
      pending: summary.pendingTolerance,
      color: "border-blue-500/30 hover:border-blue-400/60",
    },
    {
      href: "/admin/intelligence/capabilities",
      icon: "🔧",
      title: "Capability Candidates",
      description: "Proposed new part families for the CAD engine",
      pending: summary.pendingCapabilities,
      color: "border-green-500/30 hover:border-green-400/60",
    },
    {
      href: "/admin/intelligence/prompts",
      icon: "📝",
      title: "Prompt Versions",
      description: "NLU prompt candidates awaiting eval and promotion",
      pending: summary.pendingPrompts,
      color: "border-yellow-500/30 hover:border-yellow-400/60",
    },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-steel-100">Harmonia Intelligence Console</h1>
          <p className="text-steel-400 mt-1 text-sm">
            Review and approve AI-generated governance decisions
          </p>
        </div>
        {totalPending > 0 && (
          <div className="bg-amber-500/20 border border-amber-500/40 rounded-lg px-4 py-2 text-amber-300 text-sm font-medium">
            {totalPending} item{totalPending !== 1 ? "s" : ""} pending review
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sections.map((s) => (
          <Link key={s.href} href={s.href}>
            <div className={`card border transition-colors ${s.color} cursor-pointer`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{s.icon}</span>
                  <div>
                    <h2 className="text-lg font-semibold text-steel-100">{s.title}</h2>
                    <p className="text-sm text-steel-400 mt-0.5">{s.description}</p>
                  </div>
                </div>
                {s.pending > 0 && (
                  <span className="bg-amber-500 text-black text-xs font-bold rounded-full px-2 py-0.5 ml-2 shrink-0">
                    {s.pending}
                  </span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold text-steel-100 mb-4">Recent Debate Activity</h2>
        <RecentDebates />
      </div>
    </div>
  );
}

async function RecentDebates() {
  const supabase = createServiceClient();
  const { data: debates } = await supabase
    .from("intelligence_debates")
    .select("id, topic_type, final_recommendation, risk_score, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  if (!debates || debates.length === 0) {
    return <p className="text-steel-500 text-sm">No debates yet.</p>;
  }

  return (
    <div className="space-y-2">
      {debates.map((d) => (
        <Link key={d.id as string} href={`/admin/intelligence/debates/${d.id}`}>
          <div className="flex items-center justify-between p-3 rounded-lg bg-steel-900/50 hover:bg-steel-800/50 transition-colors cursor-pointer">
            <div className="flex items-center gap-3">
              <span className={`w-2 h-2 rounded-full shrink-0 ${
                d.final_recommendation === "approve_eval" ? "bg-green-400" :
                d.final_recommendation === "reject" ? "bg-red-400" : "bg-yellow-400"
              }`} />
              <span className="text-sm text-steel-300 font-mono">{d.topic_type as string}</span>
            </div>
            <div className="flex items-center gap-4 text-xs text-steel-500">
              <span>risk: {((d.risk_score as number) ?? 0).toFixed(2)}</span>
              <span className={`font-medium ${
                d.final_recommendation === "approve_eval" ? "text-green-400" :
                d.final_recommendation === "reject" ? "text-red-400" : "text-yellow-400"
              }`}>{d.final_recommendation as string}</span>
              <span>{new Date(d.created_at as string).toLocaleDateString()}</span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
