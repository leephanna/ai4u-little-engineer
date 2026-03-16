import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Job } from "@/lib/types";

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  clarifying: "Clarifying",
  generating: "Generating",
  awaiting_approval: "Awaiting Approval",
  awaiting_approval_local: "Awaiting Approval (Local)", // degraded/local-dev mode
  approved: "Approved",
  rejected: "Rejected",
  printed: "Printed",
  failed: "Failed",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`status-${status}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function JobCard({ job }: { job: Job }) {
  return (
    <Link href={`/jobs/${job.id}`} className="block">
      <div className="card hover:border-brand-700 hover:bg-steel-700 transition-all duration-150 cursor-pointer">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-steel-100 truncate">{job.title}</h3>
            <p className="text-steel-400 text-sm mt-0.5">
              {job.selected_family
                ? job.selected_family.replace(/_/g, " ")
                : "Family not selected"}
            </p>
          </div>
          <StatusBadge status={job.status} />
        </div>

        <div className="mt-3 flex items-center gap-4 text-xs text-steel-500">
          <span>
            {new Date(job.created_at).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
          {job.confidence_score && (
            <span>Confidence: {Math.round(job.confidence_score * 100)}%</span>
          )}
        </div>
      </div>
    </Link>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch recent jobs
  const { data: jobs, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const jobList: Job[] = jobs ?? [];

  // Stats
  const stats = {
    total: jobList.length,
    approved: jobList.filter((j) => j.status === "approved").length,
    printed: jobList.filter((j) => j.status === "printed").length,
    generating: jobList.filter((j) =>
      ["generating", "awaiting_approval", "awaiting_approval_local"].includes(j.status)
    ).length,
  };

  return (
    <div className="min-h-screen bg-steel-900">
      {/* Header */}
      <header className="border-b border-steel-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">AI</span>
          </div>
          <span className="font-semibold text-steel-100">Little Engineer</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-steel-400 text-sm hidden sm:block">{user.email}</span>
          <form action="/api/auth/signout" method="post">
            <button className="text-steel-400 hover:text-steel-200 text-sm transition-colors">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total Jobs", value: stats.total },
            { label: "In Progress", value: stats.generating },
            { label: "Approved", value: stats.approved },
            { label: "Printed", value: stats.printed },
          ].map((s) => (
            <div key={s.label} className="card text-center">
              <div className="text-2xl font-bold text-steel-100">{s.value}</div>
              <div className="text-xs text-steel-400 mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        {/* New job CTA */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-steel-100">Recent Jobs</h2>
          <Link href="/jobs/new" className="btn-primary flex items-center gap-2">
            <span className="text-lg leading-none">+</span>
            New Part
          </Link>
        </div>

        {/* Job list */}
        {error && (
          <div className="bg-red-900/30 border border-red-800 rounded-xl p-4 text-red-300 text-sm mb-4">
            Error loading jobs: {error.message}
          </div>
        )}

        {jobList.length === 0 ? (
          <div className="card text-center py-16">
            <div className="text-4xl mb-4">🔧</div>
            <h3 className="text-lg font-semibold text-steel-200 mb-2">No parts yet</h3>
            <p className="text-steel-400 text-sm mb-6">
              Tap &quot;New Part&quot; and describe what you need.
            </p>
            <Link href="/jobs/new" className="btn-primary">
              Create First Part
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {jobList.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
