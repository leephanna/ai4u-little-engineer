/**
 * Dashboard — Phase 3A redesign
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SystemStatusBar } from "@/components/SystemStatusBar";
import type { Job } from "@/lib/types";
import { JOB_STATUS_COLORS, JOB_STATUS_LABELS } from "@/lib/types";
import { shouldBypassLimits } from "@/lib/access-policy";
import { getAuthUser } from "@/lib/auth";

const FAMILY_EMOJI: Record<string, string> = {
  spacer: "⭕",
  l_bracket: "📐",
  u_bracket: "∪",
  flat_bracket: "▬",
  standoff_block: "🧱",
  adapter_bushing: "🔩",
  simple_jig: "🔧",
  enclosure_box: "📦",
  cable_clip: "🗜️",
  hinge: "🔗",
};

function StatCard({
  label,
  value,
  icon,
  color = "text-steel-100",
}: {
  label: string;
  value: number;
  icon: string;
  color?: string;
}) {
  return (
    <div className="card text-center">
      <div className="text-2xl mb-1">{icon}</div>
      <div className={`text-3xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-steel-400 mt-1">{label}</div>
    </div>
  );
}

type JobWithEstimate = Job & { print_time_estimate_minutes?: number };

function JobCard({ job }: { job: JobWithEstimate }) {
  const statusColor =
    JOB_STATUS_COLORS[job.status as keyof typeof JOB_STATUS_COLORS] ??
    "bg-gray-100 text-gray-700";
  const statusLabel =
    JOB_STATUS_LABELS[job.status as keyof typeof JOB_STATUS_LABELS] ??
    job.status.replace(/_/g, " ");
  const familyEmoji = FAMILY_EMOJI[job.selected_family ?? ""] ?? "⚙️";
  const familyLabel = job.selected_family?.replace(/_/g, " ") ?? "Unknown family";

  return (
    <Link href={`/jobs/${job.id}`} className="block group">
      <div className="card hover:border-brand-700 transition-all duration-150 cursor-pointer">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <span className="text-2xl flex-shrink-0 mt-0.5" aria-hidden="true">
              {familyEmoji}
            </span>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-steel-100 truncate group-hover:text-brand-300 transition-colors">
                {job.title}
              </h3>
              <p className="text-steel-500 text-sm mt-0.5 capitalize">
                {familyLabel}
              </p>
            </div>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${statusColor}`}>
            {statusLabel}
          </span>
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
          {job.print_time_estimate_minutes && (
            <span>⏱ {job.print_time_estimate_minutes} min</span>
          )}
        </div>
      </div>
    </Link>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();
    const user = await getAuthUser();
  if (!user) redirect("/sign-in");

  const { data: jobs, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("clerk_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const jobList: JobWithEstimate[] = (jobs ?? []) as JobWithEstimate[];

  const stats = {
    total: jobList.length,
    approved: jobList.filter((j) => j.status === "approved").length,
    printed: jobList.filter((j) => j.status === "printed").length,
    generating: jobList.filter((j) =>
      ["generating", "awaiting_approval"].includes(j.status)
    ).length,
  };

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, generations_this_month")
    .eq("id", user.id)
    .single();

  const plan = (profile?.plan as string) ?? "free";
  const generationsThisMonth = (profile?.generations_this_month as number) ?? 0;
  const bypass = await shouldBypassLimits(user.email);

  return (
    <div className="min-h-screen bg-steel-900">
      <header className="border-b border-steel-800 px-4 sm:px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-sm">AI</span>
          </div>
          <span className="font-semibold text-steel-100">Little Engineer</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-steel-400 text-sm hidden sm:block truncate max-w-[160px]">
            {user.email}
          </span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize hidden sm:inline ${
              plan === "pro"
                ? "bg-purple-900/50 text-purple-300 border border-purple-700"
                : plan === "maker"
                ? "bg-brand-900/50 text-brand-300 border border-brand-700"
                : "bg-steel-700 text-steel-400"
            }`}
          >
            {plan}
          </span>
          <Link
            href="/settings/printer"
            className="text-steel-400 hover:text-steel-200 text-sm transition-colors hidden sm:block"
          >
            Settings
          </Link>
          <form action="/api/auth/signout" method="post">
            <button className="text-steel-400 hover:text-steel-200 text-sm transition-colors">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 pt-4">
        <SystemStatusBar />
      </div>

      <main className="max-w-4xl mx-auto px-4 pb-8 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total Jobs" value={stats.total} icon="📋" />
          <StatCard
            label="In Progress"
            value={stats.generating}
            icon="⚙️"
            color={stats.generating > 0 ? "text-yellow-400" : "text-steel-100"}
          />
          <StatCard
            label="Approved"
            value={stats.approved}
            icon="✅"
            color={stats.approved > 0 ? "text-green-400" : "text-steel-100"}
          />
          <StatCard
            label="Printed"
            value={stats.printed}
            icon="🖨️"
            color={stats.printed > 0 ? "text-brand-400" : "text-steel-100"}
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Link
            href="/jobs/new"
            className="card flex flex-col items-center gap-2 py-4 hover:border-brand-700 transition-all cursor-pointer text-center"
          >
            <span className="text-2xl">➕</span>
            <span className="text-sm font-medium text-steel-200">New Part</span>
          </Link>
          <Link
            href="/settings/printer"
            className="card flex flex-col items-center gap-2 py-4 hover:border-brand-700 transition-all cursor-pointer text-center"
          >
            <span className="text-2xl">🖨️</span>
            <span className="text-sm font-medium text-steel-200">Printer Profile</span>
          </Link>
          <div
            className="card flex flex-col items-center gap-2 py-4 text-center opacity-50 cursor-not-allowed"
            title="Paid plans coming soon"
          >
            <span className="text-2xl">💳</span>
            <span className="text-sm font-medium text-steel-400">Plans</span>
            <span className="text-xs text-steel-600">Coming soon</span>
          </div>
          <div className="card flex flex-col items-center gap-2 py-4 text-center">
            <span className="text-2xl">{bypass.bypassed ? "♾️" : "📊"}</span>
            <span className="text-sm font-medium text-steel-200">
              {bypass.bypassed ? "Unlimited" : `${generationsThisMonth} generated`}
            </span>
            <span className="text-xs text-steel-500 capitalize">
              {bypass.bypassed
                ? `owner access · ${bypass.reason}`
                : `${plan} plan · this month`}
            </span>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-steel-100">Recent Jobs</h2>
            <Link
              href="/jobs/new"
              className="btn-primary text-sm py-1.5 px-4 flex items-center gap-1.5"
            >
              <span>+</span>
              <span>New Part</span>
            </Link>
          </div>

          {error && (
            <div className="bg-red-900/30 border border-red-800 rounded-xl p-4 text-red-300 text-sm mb-4">
              Error loading jobs: {error.message}
            </div>
          )}

          {jobList.length === 0 ? (
            <div className="card text-center py-16">
              <div className="text-5xl mb-4">🔧</div>
              <h3 className="text-xl font-semibold text-steel-200 mb-2">No parts yet</h3>
              <p className="text-steel-400 text-sm mb-2">
                Describe what you need — a bracket, spacer, jig, or bushing.
              </p>
              <p className="text-steel-500 text-xs mb-8">
                AI4U turns plain English into production-ready STEP files in seconds.
              </p>
              <div className="space-y-3 text-left max-w-xs mx-auto mb-8">
                {[
                  "Describe your part in plain English",
                  "Review the generated spec",
                  "Click Generate → download STEP/STL",
                  "Print and use it!",
                ].map((step, i) => (
                  <div key={step} className="flex items-center gap-3 text-sm text-steel-400">
                    <span className="w-6 h-6 rounded-full bg-brand-900 border border-brand-700 text-brand-400 text-xs flex items-center justify-center flex-shrink-0">
                      {i + 1}
                    </span>
                    {step}
                  </div>
                ))}
              </div>
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
        </div>
      </main>
    </div>
  );
}
