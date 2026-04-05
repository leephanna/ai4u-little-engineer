import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import type { Job, PartSpec, CadRun, Artifact, Approval, ValidationReport } from "@/lib/types";
import {
  JOB_STATUS_COLORS,
  JOB_STATUS_LABELS,
  CAD_RUN_STATUS_COLORS,
  CAD_RUN_STATUS_LABELS,
} from "@/lib/types";
import { ApprovalPanel } from "@/components/jobs/ApprovalPanel";
import { ArtifactList } from "@/components/jobs/ArtifactList";
import { SpecSummary } from "@/components/jobs/SpecSummary";
import { ValidationBadge } from "@/components/jobs/ValidationBadge";
import { RevisionPanel } from "@/components/jobs/RevisionPanel";
import { SharePanel } from "@/components/SharePanel";
import { TagEditor } from "@/components/TagEditor";
import { PrintEstimatePanel } from "@/components/jobs/PrintEstimatePanel";
import { FeedbackUploadWidget } from "@/components/jobs/FeedbackUploadWidget";
import { VirtualPrintLabPanel } from "@/components/jobs/VirtualPrintLabPanel";
import { BrandSignatureBlock } from "@/components/BrandSignatureBlock";
import { JobPreviewPanel } from "@/components/jobs/JobPreviewPanel";
import { InventionProtectionPanel } from "@/components/jobs/InventionProtectionPanel";
import { JobLiveHydration } from "@/components/jobs/JobLiveHydration";
import { JobProgressBanner } from "@/components/jobs/JobProgressBanner";

// Ensure the page is always dynamically rendered (no stale static cache)
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

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

  const statusColor = JOB_STATUS_COLORS[job.status as keyof typeof JOB_STATUS_COLORS] ?? "bg-gray-100 text-gray-700";
  const statusLabel = JOB_STATUS_LABELS[job.status as keyof typeof JOB_STATUS_LABELS] ?? job.status.replace(/_/g, " ");

  const isAwaitingApproval = job.status === "awaiting_approval";
  const isNonTerminal = !["approved", "rejected", "printed", "completed", "failed"].includes(job.status);

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
          <span className={`inline-block text-xs px-2 py-0.5 rounded-full mt-0.5 ${statusColor}`}>
            {statusLabel}
          </span>
        </div>

        {/* Generate button — available when spec exists but not yet generating */}
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
        {/* Live polling — refreshes page data until job reaches terminal state */}
        {isNonTerminal && <JobLiveHydration jobId={id} currentStatus={job.status} />}

        {/* Progress banner — shown while job is actively processing */}
        {isNonTerminal && (
          <JobProgressBanner
            status={job.status}
            cadRunStatus={latestRun?.status ?? null}
          />
        )}

        {/* 3D Preview — shown as soon as a successful run exists */}
        {latestRun?.status === "success" && (
          <section>
            <h2 className="text-sm font-medium text-steel-400 uppercase tracking-wide mb-3">
              Preview
            </h2>
            <JobPreviewPanel
              artifacts={artifacts}
              spec={latestSpec}
              jobTitle={job.title}
            />
          </section>
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
                    CAD_RUN_STATUS_COLORS[latestRun.status as keyof typeof CAD_RUN_STATUS_COLORS] ??
                    "bg-steel-700 text-steel-300"
                  }`}
                >
                  {CAD_RUN_STATUS_LABELS[latestRun.status as keyof typeof CAD_RUN_STATUS_LABELS] ??
                    latestRun.status}
                </span>
              </div>

              {/* Only show ValidationBadge for terminal run states — not while still running */}
              {latestRun.validation_report_json && ["success", "failed"].includes(latestRun.status) && (
                <ValidationBadge report={latestRun.validation_report_json as unknown as ValidationReport} />
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

        {/* Virtual Print Lab */}
        {latestRun?.status === "success" && (
          <section>
            <h2 className="text-sm font-medium text-steel-400 uppercase tracking-wide mb-3">
              Virtual Print Lab
            </h2>
            <VirtualPrintLabPanel
              jobId={id}
              cadRunId={latestRun.id}
            />
          </section>
        )}
        {/* Print Estimates + Save to Library */}
        {latestRun?.status === "success" && (
          <section>
            <h2 className="text-sm font-medium text-steel-400 uppercase tracking-wide mb-3">
              Print Info
            </h2>
            <PrintEstimatePanel
              jobId={id}
              jobTitle={job.title}
              family={(job as Job & { selected_family?: string }).selected_family ?? null}
              material={(latestSpec as PartSpec & { material?: string })?.material ?? null}
              printTimeMinutes={null}
              stlSizeBytes={artifacts.find(a => a.kind === "stl")?.file_size_bytes ?? null}
              status={job.status}
            />
          </section>
        )}

        {/* Approval Panel */}
        {isAwaitingApproval && latestRun && (
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

        {/* Revision Panel — shown after completed or failed runs */}
        {latestRun && ["completed", "failed"].includes(job.status) && latestSpec && (
          <section>
            <h2 className="text-sm font-medium text-steel-400 uppercase tracking-wide mb-3">
              Iterate
            </h2>
            <RevisionPanel
              jobId={id}
              currentVersion={latestSpec.version}
              currentFamily={latestSpec.family}
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

        {/* Feedback Photo Upload — shown after printing */}
        {job.status === "printed" && (
          <section>
            <h2 className="text-sm font-medium text-steel-400 uppercase tracking-wide mb-3">
              Print Feedback
            </h2>
            <FeedbackUploadWidget
              feedbackId={id}
              jobId={id}
            />
          </section>
        )}

        {/* Tags */}
        <section>
          <h2 className="text-sm font-medium text-steel-400 uppercase tracking-wide mb-3">
            Tags
          </h2>
          <TagEditor
            jobId={id}
            initialTags={(job as Job & { tags?: string[] }).tags ?? []}
          />
        </section>
        {/* Share */}
        <section>
          <h2 className="text-sm font-medium text-steel-400 uppercase tracking-wide mb-3">
            Share
          </h2>
          <SharePanel
            jobId={id}
            initialShared={!!(job as Job & { share_token?: string | null }).share_token}
            initialToken={(job as Job & { share_token?: string | null }).share_token ?? null}
          />
        </section>
        {/* Invention Protection Mode */}
        {latestRun?.status === "success" && (
          <section>
            <h2 className="text-sm font-medium text-steel-400 uppercase tracking-wide mb-3">
              Invention Protection
            </h2>
            <InventionProtectionPanel
              jobId={id}
              initialSummary={(job as Job & { patent_summary_json?: unknown }).patent_summary_json as Parameters<typeof InventionProtectionPanel>[0]["initialSummary"] ?? null}
            />
          </section>
        )}

        {/* Brand Signature */}
        <section>
          <div className="card bg-steel-900/50 border-steel-800">
            <BrandSignatureBlock showTagline />
          </div>
        </section>

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
                {job.created_at
                  ? new Date(job.created_at).toLocaleString()
                  : "—"}
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
