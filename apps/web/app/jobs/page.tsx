/**
 * /jobs
 *
 * My Jobs — lists all jobs for the authenticated user.
 * Server component: uses Clerk auth() + Supabase service client.
 * Redirects to /sign-in if not authenticated.
 */

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";

interface Job {
  id: string;
  title: string;
  status: string;
  requested_family: string | null;
  selected_family: string | null;
  created_at: string;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft:              "bg-steel-700 text-steel-300 border-steel-600",
    clarifying:         "bg-yellow-900/40 text-yellow-300 border-yellow-700",
    generating:         "bg-blue-900/40 text-blue-300 border-blue-700",
    awaiting_approval:  "bg-purple-900/40 text-purple-300 border-purple-700",
    approved:           "bg-green-900/40 text-green-300 border-green-700",
    complete:           "bg-green-900/40 text-green-300 border-green-700",
    failed:             "bg-red-900/40 text-red-300 border-red-700",
    rejected:           "bg-red-900/40 text-red-300 border-red-700",
    printed:            "bg-teal-900/40 text-teal-300 border-teal-700",
  };
  const cls = styles[status] ?? "bg-steel-700 text-steel-300 border-steel-600";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls} capitalize`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export const metadata = {
  title: "My Jobs | Little Engineer",
  description: "View all your AI-generated 3D part designs.",
};

export default async function JobsPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in?redirect_url=/jobs");
  }

  const serviceSupabase = createServiceClient();
  const { data: jobs, error } = await serviceSupabase
    .from("jobs")
    .select("id, title, status, requested_family, selected_family, created_at")
    .eq("clerk_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  const jobList: Job[] = jobs ?? [];

  return (
    <div className="min-h-screen bg-steel-950">
      <div className="max-w-4xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-steel-100">My Jobs</h1>
            <p className="mt-1 text-steel-400 text-sm">
              {jobList.length === 0
                ? "No parts generated yet."
                : `${jobList.length} part${jobList.length === 1 ? "" : "s"} generated`}
            </p>
          </div>
          <Link
            href="/invent"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold text-sm transition-colors shadow-md shadow-brand-900/30"
          >
            <span>+</span>
            <span>New Part</span>
          </Link>
        </div>

        {/* Empty state */}
        {jobList.length === 0 && (
          <div className="rounded-xl border border-steel-700 bg-steel-800/50 p-12 text-center">
            <div className="text-5xl mb-4">⚙️</div>
            <h2 className="text-xl font-semibold text-steel-200 mb-2">No parts yet</h2>
            <p className="text-steel-400 text-sm mb-6">
              Describe a mechanical problem and let AI design a 3D-printable solution.
            </p>
            <Link
              href="/invent"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold text-sm transition-colors"
            >
              Start Inventing →
            </Link>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="rounded-lg bg-red-900/30 border border-red-700 px-4 py-3 text-sm text-red-300 mb-4">
            Failed to load jobs: {error.message}
          </div>
        )}

        {/* Job cards */}
        {jobList.length > 0 && (
          <div className="space-y-3">
            {jobList.map((job) => (
              <Link
                key={job.id}
                href={`/jobs/${job.id}`}
                className="block rounded-xl border border-steel-700 bg-steel-800/50 hover:border-brand-600 hover:bg-steel-800 transition-all p-4 group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-base">⚙️</span>
                      <h3 className="text-steel-100 font-medium truncate group-hover:text-brand-300 transition-colors">
                        {job.title}
                      </h3>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-steel-500">
                      {(job.selected_family ?? job.requested_family) && (
                        <span className="capitalize">
                          {(job.selected_family ?? job.requested_family)?.replace(/_/g, " ")}
                        </span>
                      )}
                      <span>·</span>
                      <span>{formatDate(job.created_at)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <StatusBadge status={job.status} />
                    <svg
                      className="w-4 h-4 text-steel-500 group-hover:text-brand-400 transition-colors"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
