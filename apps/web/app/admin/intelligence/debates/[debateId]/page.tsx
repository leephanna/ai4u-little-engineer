/**
 * /admin/intelligence/debates/[debateId]
 * Debate detail view with full 3-round transcript and operator actions.
 */
import { createServiceClient } from "@/lib/supabase/service";
import { notFound } from "next/navigation";
import Link from "next/link";
import { DebateActions } from "./DebateActions";

export default async function DebateDetailPage({
  params,
}: {
  params: Promise<{ debateId: string }>;
}) {
  const { debateId } = await params;
  const supabase = createServiceClient();

  const { data: debate, error } = await supabase
    .from("intelligence_debates")
    .select("*")
    .eq("id", debateId)
    .single();

  if (error || !debate) notFound();

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-steel-100">Debate Detail</h1>
          <p className="text-steel-500 text-xs font-mono mt-1">{debateId}</p>
        </div>
        <Link href="/admin/intelligence/debates" className="text-sm text-steel-400 hover:text-steel-200">
          ← Back to Debates
        </Link>
      </div>

      {/* Summary card */}
      <div className="card">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Topic Type" value={debate.topic_type as string} mono />
          <Stat label="Recommendation" value={debate.final_recommendation as string}
            color={
              debate.final_recommendation === "approve_eval" ? "text-green-400" :
              debate.final_recommendation === "reject" ? "text-red-400" : "text-yellow-400"
            } />
          <Stat label="Risk Score" value={((debate.risk_score as number) ?? 0).toFixed(3)} />
          <Stat label="Novelty Score" value={((debate.novelty_score as number) ?? 0).toFixed(3)} />
          <Stat label="Proposer" value={`${debate.proposer_provider}/${debate.proposer_model}`} mono />
          <Stat label="Critic" value={`${debate.critic_provider}/${debate.critic_model}`} mono />
          <Stat label="Judge" value={`${debate.judge_provider}/${debate.judge_model}`} mono />
          <Stat label="Total Tokens" value={(debate.total_tokens as number)?.toLocaleString() ?? "—"} />
        </div>
      </div>

      {/* Operator actions */}
      {!(debate.operator_reviewed as boolean) && (
        <DebateActions debateId={debateId} />
      )}
      {(debate.operator_reviewed as boolean) && (
        <div className="card bg-steel-900/30">
          <p className="text-sm text-steel-400">
            Reviewed by operator on{" "}
            {new Date(debate.operator_reviewed_at as string).toLocaleString()}.
            Decision: <span className="font-medium text-steel-200">{debate.operator_decision as string}</span>
          </p>
          {debate.operator_notes && (
            <p className="text-sm text-steel-500 mt-1">{debate.operator_notes as string}</p>
          )}
        </div>
      )}

      {/* 3-round transcript */}
      <DebateRound
        round={1}
        label="Proposer"
        model={`${debate.proposer_provider as string} / ${debate.proposer_model as string}`}
        tokens={debate.proposer_tokens as number}
        latency={debate.proposer_latency_ms as number}
        output={debate.proposer_output as Record<string, unknown>}
        color="border-blue-500/30"
      />
      <DebateRound
        round={2}
        label="Critic"
        model={`${debate.critic_provider as string} / ${debate.critic_model as string}`}
        tokens={debate.critic_tokens as number}
        latency={debate.critic_latency_ms as number}
        output={debate.critic_output as Record<string, unknown>}
        color="border-red-500/30"
      />
      <DebateRound
        round={3}
        label="Judge (Consensus)"
        model={`${debate.judge_provider as string} / ${debate.judge_model as string}`}
        tokens={debate.judge_tokens as number}
        latency={debate.judge_latency_ms as number}
        output={debate.consensus_output as Record<string, unknown>}
        color="border-green-500/30"
      />
    </div>
  );
}

function Stat({
  label,
  value,
  mono,
  color,
}: {
  label: string;
  value: string;
  mono?: boolean;
  color?: string;
}) {
  return (
    <div>
      <p className="text-xs text-steel-500 mb-0.5">{label}</p>
      <p className={`text-sm font-medium ${color ?? "text-steel-200"} ${mono ? "font-mono" : ""}`}>
        {value}
      </p>
    </div>
  );
}

function DebateRound({
  round,
  label,
  model,
  tokens,
  latency,
  output,
  color,
}: {
  round: number;
  label: string;
  model: string;
  tokens: number;
  latency: number;
  output: Record<string, unknown>;
  color: string;
}) {
  return (
    <div className={`card border ${color}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="bg-steel-700 text-steel-300 text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
            {round}
          </span>
          <h3 className="font-semibold text-steel-200">{label}</h3>
          <span className="text-xs text-steel-500 font-mono">{model}</span>
        </div>
        <div className="flex gap-3 text-xs text-steel-500">
          <span>{tokens?.toLocaleString()} tokens</span>
          <span>{latency?.toLocaleString()}ms</span>
        </div>
      </div>
      <pre className="text-xs text-steel-300 bg-steel-900/50 rounded-lg p-3 overflow-auto max-h-64 whitespace-pre-wrap">
        {JSON.stringify(output, null, 2)}
      </pre>
    </div>
  );
}
