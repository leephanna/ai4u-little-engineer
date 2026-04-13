/**
 * /admin/daedalus — Daedalus Gate Receipt Inspector
 *
 * Operator-only view for inspecting all Daedalus Gate receipts.
 * Shows:
 *   - Recent receipts (last 50)
 *   - Filter by gate, result, session_id, job_id
 *   - Per-receipt payload drill-down
 *   - Stats: GO / CLARIFY / REJECT / WARN counts
 */
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";

interface DaedalusReceipt {
  id: string;
  gate: string;
  session_id: string | null;
  job_id: string | null;
  user_id: string | null;
  timestamp: string;
  elapsed_ms: number | null;
  result: string;
  confidence: number | null;
  payload: Record<string, unknown>;
  notes: string[];
  created_at: string;
}

const RESULT_STYLES: Record<string, string> = {
  GO: "text-green-400 bg-green-900/30 border-green-700/50",
  CLARIFY: "text-yellow-400 bg-yellow-900/30 border-yellow-700/50",
  REJECT: "text-red-400 bg-red-900/30 border-red-700/50",
  WARN: "text-orange-400 bg-orange-900/30 border-orange-700/50",
};

const GATE_ICONS: Record<string, string> = {
  intake_interpretation: "🧠",
  harmonia_merge: "🔀",
  clarification: "💬",
  preview: "👁",
  vpl: "🔬",
  trust: "🛡",
  generation: "⚙️",
  artemis_demo_generation: "🚀",
};

export default async function DaedalusDashboardPage({
  searchParams,
}: {
  searchParams: { gate?: string; result?: string; session_id?: string; job_id?: string };
}) {
  // Auth check
  const supabase = await createClient();
    const user = await getAuthUser();
  if (!user) redirect("/sign-in");

  // Operator check
  const serviceSupabase = createServiceClient();
  const { data: profile } = await serviceSupabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "operator") redirect("/dashboard");

  // Build query
  let query = serviceSupabase
    .from("daedalus_receipts")
    .select("*")
    .order("timestamp", { ascending: false })
    .limit(50);

  if (searchParams.gate) query = query.eq("gate", searchParams.gate);
  if (searchParams.result) query = query.eq("result", searchParams.result);
  if (searchParams.session_id) query = query.eq("session_id", searchParams.session_id);
  if (searchParams.job_id) query = query.eq("job_id", searchParams.job_id);

  const { data: receipts } = await query;
  const allReceipts: DaedalusReceipt[] = (receipts ?? []) as DaedalusReceipt[];

  // Stats
  const stats = {
    GO: allReceipts.filter((r) => r.result === "GO").length,
    CLARIFY: allReceipts.filter((r) => r.result === "CLARIFY").length,
    REJECT: allReceipts.filter((r) => r.result === "REJECT").length,
    WARN: allReceipts.filter((r) => r.result === "WARN").length,
    total: allReceipts.length,
  };

  const avgConfidence =
    allReceipts.filter((r) => r.confidence !== null).length > 0
      ? allReceipts
          .filter((r) => r.confidence !== null)
          .reduce((sum, r) => sum + (r.confidence ?? 0), 0) /
        allReceipts.filter((r) => r.confidence !== null).length
      : null;

  const avgElapsed =
    allReceipts.filter((r) => r.elapsed_ms !== null).length > 0
      ? Math.round(
          allReceipts
            .filter((r) => r.elapsed_ms !== null)
            .reduce((sum, r) => sum + (r.elapsed_ms ?? 0), 0) /
            allReceipts.filter((r) => r.elapsed_ms !== null).length
        )
      : null;

  return (
    <div className="min-h-screen bg-steel-900 text-steel-100 p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-steel-100 flex items-center gap-2">
              <span>🔐</span>
              <span>Daedalus Gate Inspector</span>
            </h1>
            <p className="text-steel-500 text-sm mt-1">
              Structured proof receipts for the full intake → preview → generate path
            </p>
          </div>
          <a
            href="/admin"
            className="text-steel-400 hover:text-steel-200 text-sm transition-colors"
          >
            ← Back to Admin
          </a>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-8">
          {[
            { label: "Total", value: stats.total, color: "text-steel-300" },
            { label: "GO", value: stats.GO, color: "text-green-400" },
            { label: "CLARIFY", value: stats.CLARIFY, color: "text-yellow-400" },
            { label: "REJECT", value: stats.REJECT, color: "text-red-400" },
            { label: "WARN", value: stats.WARN, color: "text-orange-400" },
            {
              label: "Avg Confidence",
              value: avgConfidence !== null ? `${(avgConfidence * 100).toFixed(0)}%` : "—",
              color: "text-brand-400",
            },
          ].map((s) => (
            <div
              key={s.label}
              className="bg-steel-800 border border-steel-700 rounded-xl p-3 text-center"
            >
              <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-steel-500 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap gap-2 mb-6">
          <span className="text-xs text-steel-500 self-center">Filter:</span>
          {["intake_interpretation", "harmonia_merge", "clarification", "preview", "vpl", "trust", "generation"].map(
            (gate) => (
              <a
                key={gate}
                href={`/admin/daedalus?gate=${gate}`}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  searchParams.gate === gate
                    ? "border-brand-600 text-brand-300 bg-brand-900/40"
                    : "border-steel-700 text-steel-500 hover:border-steel-600"
                }`}
              >
                {GATE_ICONS[gate]} {gate.replace(/_/g, " ")}
              </a>
            )
          )}
          {["GO", "CLARIFY", "REJECT", "WARN"].map((result) => (
            <a
              key={result}
              href={`/admin/daedalus?result=${result}`}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                searchParams.result === result
                  ? `border-current ${RESULT_STYLES[result]}`
                  : "border-steel-700 text-steel-500 hover:border-steel-600"
              }`}
            >
              {result}
            </a>
          ))}
          {(searchParams.gate || searchParams.result || searchParams.session_id || searchParams.job_id) && (
            <a
              href="/admin/daedalus"
              className="text-xs px-2.5 py-1 rounded-full border border-steel-700 text-steel-500 hover:border-red-600 hover:text-red-400 transition-colors"
            >
              ✕ Clear filters
            </a>
          )}
        </div>

        {/* Receipts table */}
        {allReceipts.length === 0 ? (
          <div className="text-center py-20 text-steel-600">
            <div className="text-4xl mb-3">📭</div>
            <p>No receipts found{searchParams.gate ? ` for gate: ${searchParams.gate}` : ""}.</p>
            <p className="text-sm mt-1">Receipts are generated when users interact with the intake flow.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {allReceipts.map((receipt) => (
              <div
                key={receipt.id}
                className="bg-steel-800 border border-steel-700 rounded-xl overflow-hidden"
              >
                {/* Receipt header */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-steel-700">
                  <span className="text-lg">{GATE_ICONS[receipt.gate] ?? "📋"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-steel-200">
                        {receipt.gate.replace(/_/g, " ")}
                      </span>
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                          RESULT_STYLES[receipt.result] ?? "text-steel-400 bg-steel-700 border-steel-600"
                        }`}
                      >
                        {receipt.result}
                      </span>
                      {receipt.confidence !== null && (
                        <span className="text-xs text-steel-500">
                          {(receipt.confidence * 100).toFixed(0)}% confidence
                        </span>
                      )}
                      {receipt.elapsed_ms !== null && (
                        <span className="text-xs text-steel-600">{receipt.elapsed_ms}ms</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-steel-600 flex-wrap">
                      <span>{new Date(receipt.timestamp).toLocaleString()}</span>
                      {receipt.session_id && (
                        <a
                          href={`/admin/daedalus?session_id=${receipt.session_id}`}
                          className="hover:text-brand-400 transition-colors"
                        >
                          session: {receipt.session_id.slice(0, 8)}…
                        </a>
                      )}
                      {receipt.job_id && (
                        <a
                          href={`/admin/daedalus?job_id=${receipt.job_id}`}
                          className="hover:text-brand-400 transition-colors"
                        >
                          job: {receipt.job_id.slice(0, 8)}…
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                {/* Notes */}
                {receipt.notes.length > 0 && (
                  <div className="px-4 py-2 bg-steel-800/50 border-b border-steel-700/50">
                    <div className="flex flex-wrap gap-2">
                      {receipt.notes.map((note, i) => (
                        <span key={i} className="text-xs text-steel-500">
                          · {note}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Payload (collapsed by default) */}
                <details className="group">
                  <summary className="px-4 py-2 text-xs text-steel-600 cursor-pointer hover:text-steel-400 transition-colors select-none">
                    <span className="group-open:hidden">▶ Show payload</span>
                    <span className="hidden group-open:inline">▼ Hide payload</span>
                  </summary>
                  <div className="px-4 pb-4">
                    <pre className="text-xs text-steel-400 bg-steel-900 rounded-lg p-3 overflow-x-auto">
                      {JSON.stringify(receipt.payload, null, 2)}
                    </pre>
                  </div>
                </details>
              </div>
            ))}
          </div>
        )}

        {/* Footer note */}
        <div className="mt-8 text-center text-xs text-steel-700">
          Showing last {allReceipts.length} receipts.{" "}
          {avgElapsed !== null && `Avg latency: ${avgElapsed}ms. `}
          Receipts are stored for 90 days.
        </div>
      </div>
    </div>
  );
}
