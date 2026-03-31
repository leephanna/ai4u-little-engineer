/**
 * /admin/vpl
 *
 * Operator console: Virtual Print Lab results viewer.
 * Shows all VPL test results with grade distribution, recent tests,
 * and a breakdown of issues and recommendations.
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

const GRADE_COLORS: Record<string, string> = {
  A: "bg-green-100 text-green-800",
  B: "bg-blue-100 text-blue-800",
  C: "bg-yellow-100 text-yellow-800",
  D: "bg-orange-100 text-orange-800",
  F: "bg-red-100 text-red-800",
};

const RISK_COLORS: Record<string, string> = {
  low: "text-green-700",
  medium: "text-yellow-700",
  high: "text-orange-700",
  critical: "text-red-700",
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

  const allTests: VplTest[] = tests ?? [];

  // Grade distribution
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

  // Top issues
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
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <Link href="/admin" className="hover:text-gray-700">Admin</Link>
              <span>/</span>
              <span>Virtual Print Lab</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">🧪 Virtual Print Lab Console</h1>
            <p className="mt-1 text-gray-600 text-sm">
              Geometry validation, slicer simulation, and printability heuristics for all generated designs.
            </p>
          </div>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-3xl font-bold text-gray-900">{allTests.length}</p>
            <p className="text-sm text-gray-500 mt-1">Total Tests</p>
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

          {/* Top issues */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
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

        {/* Recent tests table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Recent VPL Tests</h2>
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
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Issues</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ran</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {allTests.map((test) => (
                    <tr key={test.id} className="hover:bg-gray-50">
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
                      <td className="px-4 py-3 text-gray-500">{(test.all_issues ?? []).length}</td>
                      <td className="px-4 py-3 text-gray-500">{test.elapsed_seconds.toFixed(1)}s</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {new Date(test.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
