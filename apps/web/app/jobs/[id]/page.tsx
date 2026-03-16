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
  awaiting_approval_local: "text-yellow-500", // degraded/local-dev mode
  approved: "text-green-400",
  rejected: "text-red-400",
  printed: "text-emerald-400",
  failed: "text-red-500",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  clarifying: "Clarifying",
  generating: "Generating",
  awaiting_approval: "Awaiting Approval",
  awaiting_approval_local: "Awaiting Approval (Local Dev)",
  approved: "Approved",
  rejected: "Rejected",
  printed: "Printed",
  failed: "Failed",
};

const RUN_STATUS_COLORS: Record<string, string> = {
  success: "bg-green-900 text-green-300",
  degraded_local: "bg-yellow-900 text-yellow-300",
  failed: "bg-red-900 text-red-300",
  running: "bg-brand-900 text-brand-300",
  queued: "bg-steel-700 text-steel-300",
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
  const statusLabel = STATUS_LABELS[job.status] ?? job.status.replace(/_/g, " ");

  const isLocalDev = job.status === "awaiting_approval_local";
  const isAwaitingApproval =
    job.status === "awaiting_approval" || job.status === "awaiting_approval_local";

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
          <p className={`text-xs ${statusColor} capitalize`}>{statusLabel}</p>
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

        {/* ── Local-dev degraded mode warning ── */}
        {isLocalDev && (
          <div className="bg-yellow-900/40 border border-yellow-600 rounded-xl px-4 py-3 text-yellow-200 text-sm">
            <p className="font-semibold mb-1">⚠ Local Dev Mode — Artifacts Not Persisted</p>
            <p className="text-yellow-300 text-xs leading-relaxed">
              This job was completed with{" "}
              <code className="font-mono bg-yellow-900/60 px-1 rounded">
                ALLOW_LOCAL_ARTIFACT_PATHS=true
              </code>
              . The CAD files were generated locally but were <strong>not uploaded</strong> to
              Supabase Storage. Downloads are unavailable. To get downloadable STEP/STL files,
              re-run this job in a production environment with a configured Supabase Storage bucket.
            </p>
          </div>
        )}

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
                    RUN_STATUS_COLORS[latestRun.status] ?? "bg-steel-700 text-steel-300"
                  }`}
                >
                  {latestRun.status === "degraded_local" ? "degraded (local)" : latestRun.status}
                </span>
              </div>

              {latestRun.status === "degraded_local" && (
                <p className="text-yellow-400 text-xs">
                  Run completed in local-dev mode. Files were not uploaded to Supabase Storage.
                </p>
              )}

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

        {/* Approval Panel — shown for both awaiting_approval and awaiting_approval_local */}
        {isAwaitingApproval && latestRun && (
          <section>
            <h2 className="text-sm font-medium text-steel-400 uppercase tracking-wide mb-3">
              Review & Approve
            </h2>
            {isLocalDev && (
              <p className="text-yellow-400 text-xs mb-3">
                You can still approve this local-dev run, but no downloadable files will be
                available until the job is re-run in production.
              </p>
            )}
            <ApprovalPanel
              jobId={id}
              cadRunId={latestRun.id}
              existingApproval={latestApproval}
            />
          </section>
        )}

        {/* Approval result */}
        {latestApproval && !isAwaitingApproval && (
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
