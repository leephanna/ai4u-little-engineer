/**
 * /admin/intelligence/capabilities
 * List capability candidates with governance lifecycle.
 */
import { createServiceClient } from "@/lib/supabase/service";
import Link from "next/link";
import { CapabilityAction } from "./CapabilityAction";

export default async function CapabilitiesPage() {
  const supabase = createServiceClient();
  const { data: candidates } = await supabase
    .from("capability_candidates")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-steel-100">Capability Candidates</h1>
          <p className="text-steel-400 text-sm mt-1">Proposed new part families for the CAD engine</p>
        </div>
        <Link href="/admin/intelligence" className="text-sm text-steel-400 hover:text-steel-200">
          ← Back
        </Link>
      </div>

      <div className="space-y-4">
        {(candidates ?? []).map((c) => (
          <div key={c.id as string} className="card">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-mono text-sm text-steel-200 font-semibold">
                    {c.family_name as string}
                  </span>
                  <StatusBadge status={c.status as string} />
                  {c.governance_stage && (
                    <span className="text-xs text-steel-500 font-mono">{c.governance_stage as string}</span>
                  )}
                </div>
                <p className="text-sm text-steel-400 mb-3">{c.description as string}</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-steel-500">Request Count</p>
                    <p className="text-steel-200">{c.request_count as number} requests</p>
                  </div>
                  <div>
                    <p className="text-xs text-steel-500">Confidence</p>
                    <p className="text-steel-200">{(((c.confidence_score as number) ?? 0) * 100).toFixed(0)}%</p>
                  </div>
                  <div>
                    <p className="text-xs text-steel-500">Proposed</p>
                    <p className="text-steel-200">{new Date(c.created_at as string).toLocaleDateString()}</p>
                  </div>
                </div>
                {c.required_dimensions && (
                  <div className="mt-2">
                    <p className="text-xs text-steel-500">Required Dimensions</p>
                    <p className="text-xs text-steel-400 font-mono">
                      {JSON.stringify(c.required_dimensions)}
                    </p>
                  </div>
                )}
                {c.debate_id && (
                  <div className="mt-2">
                    <Link
                      href={`/admin/intelligence/debates/${c.debate_id}`}
                      className="text-xs text-brand-400 hover:text-brand-300"
                    >
                      View Harmonia Debate →
                    </Link>
                  </div>
                )}
              </div>
              {(c.status as string) === "proposed" && (
                <CapabilityAction candidateId={c.id as string} />
              )}
            </div>
          </div>
        ))}
        {(!candidates || candidates.length === 0) && (
          <div className="card text-center text-steel-500 py-8">
            No capability candidates yet. Run the propose-new-capability task to generate them.
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    proposed: "bg-amber-500/20 text-amber-300",
    debate_pending: "bg-blue-500/20 text-blue-300",
    approved: "bg-green-500/20 text-green-300",
    rejected: "bg-red-500/20 text-red-300",
    implemented: "bg-purple-500/20 text-purple-300",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[status] ?? "bg-steel-700 text-steel-400"}`}>
      {status}
    </span>
  );
}
