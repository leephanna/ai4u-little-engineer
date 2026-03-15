import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import type { Job, PartSpec, CadRun, Artifact, Approval } from "@/lib/types";
import { ApprovalPanel } from "@/components/jobs/ApprovalPanel";
import { ArtifactList } from "@/components/jobs/ArtifactList";
import { SpecSummary } from "@/components/jobs/SpecSummary";
import { ValidationBadge } from "@/components/jobs/ValidationBadge";

interface PageProps {
  params: Promise<{ id: string }>;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "text-steel-400",
  clarifying: "text-yellow-400",
  generating: "text-brand-400",
  awaiting_approval: "text-orange-400",
  approved: "text-green-400",
  rejected: "text-red-400",
  printed: "text-emerald-400",
  failed: "text-red-500",
};

export default async function JobDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Fetch job
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (jobError || !job) notFound();

  // Fetch related data in parallel
  const [specsRes, runsRes, artifactsRes, approvalsRes] = await Promise.all([
    supabase
      .from("part_specs")
      .select("*")
      .eq("job_id", id)
      .order("version", { ascending: false }),
    supabase
      .from("cad_runs")
      .select("*")
      .eq("job_id", id)
      .order("started_at", { ascending: false }),
    supabase
      .from("artifacts")
      .select("*")
      .eq("job_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("approvals")
      .select("*")
      .eq("job_id", id)
      .order("decided_at", { ascending: false }),
  ]);

  const specs: PartSpec[] = specsRes.data ?? [];
  const runs: CadRun[] = runsRes.data ?? [];
  const artifacts: Artifact[] = artifactsRes.data ?? [];
  const approvals: Approval[] = approvalsRes.data ?? [];

  const latestSpec = specs[0] ?? null;
  const latestRun = runs[0] ?? null;
  const latestApproval = approvals[0] ?? null;

  const statusColor = STATUS_COLORS[job.status] ?? "text-steel-400";

  return (
    <div className="min-h-screen bg-steel-900">
      {/* Header */}
      <header className="border-b border-steel-800 px-4 py-3 flex items-center gap-3">
        <Link
          href="/dashboard"
          className="text-steel-400 hover:text-steel-100 transition-colors p-1"
          aria-label="Back to dashboard"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold text-steel-100 truncate">{job.title}</h1>
          <p className={`text-xs ${statusColor} capitalize`}>
            {job.status.replace(/_/g, " ")}
          </p>
        </div>

        {/* Generate button */}
        {latestSpec && ["draft", "clarifying", "failed"].includes(job.status) && (
          <Link
            href={`/jobs/${id}/generate`}
            className="btn-primary text-sm py-1.5 px-3"
          >
            Generate
          </Link>
        )}
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Part Spec Summary */}
        {latestSpec && (
          <section>
            <h2 className="text-sm font-medium text-steel-400 uppercase tracking-wide mb-3">
              Part Specification (v{latestSpec.version})
            </h2>
            <SpecSummary spec={latestSpec} />
          </section>
        )}

        {/* Latest CAD Run */}
        {latestRun && (
          <section>
            <h2 className="text-sm font-medium text-steel-400 uppercase tracking-wide mb-3">
              Latest CAD Run
            </h2>
            <div className="card space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-steel-300 text-sm font-medium">
                  {latestRun.generator_name} v{latestRun.generator_version}
                </span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    latestRun.status === "success"
                      ? "bg-green-900 text-green-300"
                      : latestRun.status === "failed"
                      ? "bg-red-900 text-red-300"
                      : latestRun.status === "running"
                      ? "bg-brand-900 text-brand-300"
                      : "bg-steel-700 text-steel-300"
                  }`}
                >
                  {latestRun.status}
                </span>
              </div>

              {latestRun.validation_report_json && (
                <ValidationBadge report={latestRun.validation_report_json} />
              )}

              {latestRun.error_text && (
                <div className="bg-red-900/30 border border-red-800 rounded-lg px-3 py-2 text-red-300 text-xs font-mono">
                  {latestRun.error_text}
                </div>
              )}
            </div>
          </section>
        )}

        {/* Artifacts */}
        {artifacts.length > 0 && (
          <section>
            <h2 className="text-sm font-medium text-steel-400 uppercase tracking-wide mb-3">
              Artifacts
            </h2>
            <ArtifactList artifacts={artifacts} jobId={id} />
          </section>
        )}

        {/* Approval Panel */}
        {job.status === "awaiting_approval" && latestRun && (
          <section>
            <h2 className="text-sm font-medium text-steel-400 uppercase tracking-wide mb-3">
              Review & Approve
            </h2>
            <ApprovalPanel
              jobId={id}
              cadRunId={latestRun.id}
              existingApproval={latestApproval}
            />
          </section>
        )}

        {/* Approval result */}
        {latestApproval && job.status !== "awaiting_approval" && (
          <section>
            <div
              className={`card ${
                latestApproval.decision === "approved"
                  ? "border-green-800"
                  : "border-red-800"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">
                  {latestApproval.decision === "approved" ? "✅" : "❌"}
                </span>
                <span className="font-medium text-steel-100 capitalize">
                  {latestApproval.decision.replace(/_/g, " ")}
                </span>
              </div>
              {latestApproval.notes && (
                <p className="text-steel-400 text-sm mt-2">{latestApproval.notes}</p>
              )}
            </div>
          </section>
        )}

        {/* Job metadata */}
        <section>
          <h2 className="text-sm font-medium text-steel-400 uppercase tracking-wide mb-3">
            Details
          </h2>
          <div className="card">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-steel-500">Job ID</dt>
              <dd className="text-steel-300 font-mono text-xs">{id.slice(0, 8)}…</dd>
              <dt className="text-steel-500">Created</dt>
              <dd className="text-steel-300">
                {new Date(job.created_at).toLocaleString()}
              </dd>
              <dt className="text-steel-500">Spec version</dt>
              <dd className="text-steel-300">{job.latest_spec_version}</dd>
              {job.confidence_score && (
                <>
                  <dt className="text-steel-500">Confidence</dt>
                  <dd className="text-steel-300">
                    {Math.round(job.confidence_score * 100)}%
                  </dd>
                </>
              )}
            </dl>
          </div>
        </section>
      </main>
    </div>
  );
}
