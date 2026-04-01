/**
 * /admin/vpl
 *
 * Operator console: Virtual Print Lab + Trust Policy results viewer.
 * Shows all VPL test results with grade distribution, trust tier breakdown,
 * recent tests with trust tier and rotation priority, and a review queue
 * for designs that require operator action.
 *
 * Extended in Migration 008 to include trust_policy_decisions data.
 */

import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

interface VplTest {
  id: string;
  job_id: string;
  cad_run_id: string;
  print_success_score: number;
  grade: string;
  ready_to_print: boolean;
  risk_level: string;
  all_issues: string[];
  all_recommendations: string[];
  elapsed_seconds: number;
  created_at: string;
}

interface TrustDecision {
  id: string;
  project_id: string | null;
  job_id: string | null;
  vpl_test_id: string | null;
  trust_tier: string;
  marketplace_allowed: boolean;
  public_listing_allowed: boolean;
  requires_operator_review: boolean;
  rotation_priority: string;
  monitoring_level: string;
  notes: string[];
  created_at: string;
}

const GRADE_COLORS: Record<string, string> = {
  A: "bg-green-100 text-green-800",
  B: "bg-blue-100 text-blue-800",
  C: "bg-yellow-100 text-yellow-800",
  D: "bg-orange-100 text-orange-800",
  F: "bg-red-100 text-red-800",
};

const RISK_COLORS: Record<string, string> = {
  low: "text-green-700",
  moderate: "text-yellow-700",
  high: "text-orange-700",
  critical: "text-red-700",
};

const TIER_COLORS: Record<string, string> = {
  trusted_commercial: "bg-green-100 text-green-800",
  verified: "bg-blue-100 text-blue-800",
  low_confidence: "bg-yellow-100 text-yellow-800",
  unverified: "bg-gray-100 text-gray-600",
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: "text-red-700 font-bold",
  high: "text-orange-700 font-semibold",
  standard: "text-gray-600",
  low: "text-gray-400",
};

export default async function AdminVplPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Check admin role
  const serviceSupabase = createServiceClient();
  const { data: profile } = await serviceSupabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") redirect("/dashboard");

  // Fetch recent VPL tests
  const { data: tests } = await serviceSupabase
    .from("virtual_print_tests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  // Fetch recent trust policy decisions
  const { data: decisions } = await serviceSupabase
    .from("trust_policy_decisions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  const allTests: VplTest[] = tests ?? [];
  const allDecisions: TrustDecision[] = decisions ?? [];

  // Build a lookup: vpl_test_id → trust decision
  const decisionByVplId: Record<string, TrustDecision> = {};
  for (const d of allDecisions) {
    if (d.vpl_test_id) decisionByVplId[d.vpl_test_id] = d;
  }

  // ── Grade distribution ──────────────────────────────────────────────────
  const gradeCount: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  let totalScore = 0;
  let readyCount = 0;
  for (const t of allTests) {
    gradeCount[t.grade] = (gradeCount[t.grade] ?? 0) + 1;
    totalScore += t.print_success_score;
    if (t.ready_to_print) readyCount++;
  }
  const avgScore = allTests.length > 0 ? (totalScore / allTests.length).toFixed(1) : "—";
  const readyPct = allTests.length > 0 ? ((readyCount / allTests.length) * 100).toFixed(0) : "—";

  // ── Trust tier distribution ─────────────────────────────────────────────
  const tierCount: Record<string, number> = {
    trusted_commercial: 0,
    verified: 0,
    low_confidence: 0,
    unverified: 0,
  };
  let reviewRequired = 0;
  let highPriorityCount = 0;
  for (const d of allDecisions) {
    tierCount[d.trust_tier] = (tierCount[d.trust_tier] ?? 0) + 1;
    if (d.requires_operator_review) reviewRequired++;
    if (d.rotation_priority === "critical" || d.rotation_priority === "high") highPriorityCount++;
  }

  // ── Review queue: decisions requiring operator action ───────────────────
  const reviewQueue = allDecisions.filter((d) => d.requires_operator_review).slice(0, 20);

  // ── Top issues ──────────────────────────────────────────────────────────
  const issueCounts: Record<string, number> = {};
  for (const t of allTests) {
    for (const issue of t.all_issues ?? []) {
      issueCounts[issue] = (issueCounts[issue] ?? 0) + 1;
    }
  }
  const topIssues = Object.entries(issueCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <Link href="/admin" className="hover:text-gray-700">Admin</Link>
              <span>/</span>
              <span>Virtual Print Lab + Trust Policy</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">🧪 VPL + Trust Policy Console</h1>
            <p className="mt-1 text-gray-600 text-sm">
              Geometry validation, slicer simulation, printability heuristics, and trust tier assignments for all generated designs.
            </p>
          </div>
        </div>

        {/* VPL Summary stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-3xl font-bold text-gray-900">{allTests.length}</p>
            <p className="text-sm text-gray-500 mt-1">Total VPL Tests</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-3xl font-bold text-gray-900">{avgScore}</p>
            <p className="text-sm text-gray-500 mt-1">Avg Score</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-3xl font-bold text-green-700">{readyPct}%</p>
            <p className="text-sm text-gray-500 mt-1">Ready to Print</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-3xl font-bold text-blue-700">{gradeCount["A"] ?? 0}</p>
            <p className="text-sm text-gray-500 mt-1">Grade A Designs</p>
          </div>
        </div>

        {/* Trust Policy Summary stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl border border-green-200 p-4 text-center">
            <p className="text-3xl font-bold text-green-700">{tierCount["trusted_commercial"]}</p>
            <p className="text-sm text-gray-500 mt-1">Trusted Commercial</p>
          </div>
          <div className="bg-white rounded-xl border border-blue-200 p-4 text-center">
            <p className="text-3xl font-bold text-blue-700">{tierCount["verified"]}</p>
            <p className="text-sm text-gray-500 mt-1">Verified</p>
          </div>
          <div className="bg-white rounded-xl border border-yellow-200 p-4 text-center">
            <p className="text-3xl font-bold text-yellow-700">{tierCount["low_confidence"] + tierCount["unverified"]}</p>
            <p className="text-sm text-gray-500 mt-1">Blocked (Low/Unverified)</p>
          </div>
          <div className="bg-white rounded-xl border border-red-200 p-4 text-center">
            <p className="text-3xl font-bold text-red-700">{reviewRequired}</p>
            <p className="text-sm text-gray-500 mt-1">Require Review</p>
          </div>
        </div>

        {/* Operator Review Queue */}
        {reviewQueue.length > 0 && (
          <div className="mb-8 bg-red-50 border border-red-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-red-200 flex items-center gap-2">
              <span className="text-red-700 font-bold text-lg">⚠</span>
              <h2 className="font-semibold text-red-900">Operator Review Required ({reviewQueue.length})</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-red-100 border-b border-red-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-red-700 uppercase">Project</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-red-700 uppercase">Trust Tier</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-red-700 uppercase">Rotation Priority</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-red-700 uppercase">Reason</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-red-700 uppercase">Decided</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-red-100">
                  {reviewQueue.map((d) => (
                    <tr key={d.id} className="hover:bg-red-100/50">
                      <td className="px-4 py-3 font-mono text-xs text-blue-600">
                        {d.project_id ? d.project_id.slice(0, 8) + "…" : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${TIER_COLORS[d.trust_tier] ?? "bg-gray-100 text-gray-600"}`}>
                          {d.trust_tier}
                        </span>
                      </td>
                      <td className={`px-4 py-3 capitalize ${PRIORITY_COLORS[d.rotation_priority] ?? ""}`}>
                        {d.rotation_priority}
                      </td>
                      <td className="px-4 py-3 text-gray-700 text-xs max-w-xs">
                        {(d.notes ?? []).slice(0, 2).join(" · ")}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {new Date(d.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Grade distribution */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Grade Distribution</h2>
            <div className="space-y-3">
              {["A", "B", "C", "D", "F"].map((grade) => {
                const count = gradeCount[grade] ?? 0;
                const pct = allTests.length > 0 ? (count / allTests.length) * 100 : 0;
                return (
                  <div key={grade} className="flex items-center gap-3">
                    <span className={`w-8 text-center text-xs font-bold px-1.5 py-0.5 rounded ${GRADE_COLORS[grade] ?? ""}`}>
                      {grade}
                    </span>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${grade === "A" ? "bg-green-500" : grade === "B" ? "bg-blue-500" : grade === "C" ? "bg-yellow-500" : grade === "D" ? "bg-orange-500" : "bg-red-500"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-sm text-gray-600 w-8 text-right">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Trust tier distribution */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Trust Tier Distribution</h2>
            {allDecisions.length === 0 ? (
              <p className="text-sm text-gray-500">No trust decisions recorded yet.</p>
            ) : (
              <div className="space-y-3">
                {(["trusted_commercial", "verified", "low_confidence", "unverified"] as const).map((tier) => {
                  const count = tierCount[tier] ?? 0;
                  const pct = allDecisions.length > 0 ? (count / allDecisions.length) * 100 : 0;
                  const barColor = tier === "trusted_commercial" ? "bg-green-500" : tier === "verified" ? "bg-blue-500" : tier === "low_confidence" ? "bg-yellow-500" : "bg-gray-400";
                  return (
                    <div key={tier} className="flex items-center gap-3">
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded whitespace-nowrap ${TIER_COLORS[tier]}`} style={{ minWidth: "7rem" }}>
                        {tier.replace("_", " ")}
                      </span>
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-sm text-gray-600 w-6 text-right">{count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Top issues */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Most Common Issues</h2>
            {topIssues.length === 0 ? (
              <p className="text-sm text-gray-500">No issues recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {topIssues.map(([issue, count]) => (
                  <div key={issue} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-gray-700 flex-1 truncate">{issue}</span>
                    <span className="shrink-0 text-xs font-medium bg-red-50 text-red-700 px-2 py-0.5 rounded">
                      {count}×
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent tests table — extended with trust tier */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Recent VPL Tests + Trust Decisions</h2>
          </div>
          {allTests.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No VPL tests have run yet. Tests run automatically after each successful CAD generation.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Job</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Grade</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Score</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ready</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Risk</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Trust Tier</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">KG Priority</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Review?</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Issues</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ran</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {allTests.map((test) => {
                    const decision = decisionByVplId[test.id];
                    return (
                      <tr key={test.id} className={`hover:bg-gray-50 ${decision?.requires_operator_review ? "bg-red-50/30" : ""}`}>
                        <td className="px-4 py-3">
                          <Link
                            href={`/jobs/${test.job_id}`}
                            className="font-mono text-xs text-blue-600 hover:underline"
                          >
                            {test.job_id.slice(0, 8)}…
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded ${GRADE_COLORS[test.grade] ?? "bg-gray-100 text-gray-700"}`}>
                            {test.grade}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-semibold text-gray-900">{test.print_success_score}</td>
                        <td className="px-4 py-3">
                          {test.ready_to_print ? (
                            <span className="text-green-700 font-medium">✓ Yes</span>
                          ) : (
                            <span className="text-red-700 font-medium">✗ No</span>
                          )}
                        </td>
                        <td className={`px-4 py-3 capitalize font-medium ${RISK_COLORS[test.risk_level] ?? "text-gray-700"}`}>
                          {test.risk_level}
                        </td>
                        <td className="px-4 py-3">
                          {decision ? (
                            <span className={`text-xs font-medium px-2 py-0.5 rounded ${TIER_COLORS[decision.trust_tier] ?? "bg-gray-100 text-gray-600"}`}>
                              {decision.trust_tier.replace("_", " ")}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                        <td className={`px-4 py-3 capitalize text-xs ${decision ? (PRIORITY_COLORS[decision.rotation_priority] ?? "") : "text-gray-400"}`}>
                          {decision?.rotation_priority ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          {decision?.requires_operator_review ? (
                            <span className="text-xs font-bold text-red-700">⚠ Yes</span>
                          ) : (
                            <span className="text-xs text-gray-400">No</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-500">{(test.all_issues ?? []).length}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs">
                          {new Date(test.created_at).toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
