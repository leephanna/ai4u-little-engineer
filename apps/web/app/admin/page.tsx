/**
 * Admin Dashboard
 *
 * Protected by admin layout (role='admin' check in layout.tsx).
 * Shows: total users, total generations, failed generation rate,
 *        revenue this month, most popular part families.
 * Links to /admin/users and /admin/jobs.
 */
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

function StatCard({
  label,
  value,
  icon,
  sub,
  href,
}: {
  label: string;
  value: string | number;
  icon: string;
  sub?: string;
  href?: string;
}) {
  const inner = (
    <div className="card text-center hover:border-brand-500/50 transition-colors">
      <div className="text-2xl mb-1">{icon}</div>
      <div className="text-3xl font-bold text-steel-100">{value}</div>
      <div className="text-xs text-steel-400 mt-1">{label}</div>
      {sub && <div className="text-xs text-steel-600 mt-0.5">{sub}</div>}
    </div>
  );
  if (href) return <Link href={href}>{inner}</Link>;
  return inner;
}

export default async function AdminPage() {
  const supabase = await createClient();

  const [profilesRes, jobsRes, cadRunsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, role, plan, stripe_subscription_id, subscription_status, generations_this_month, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("jobs")
      .select("id, title, status, selected_family, created_at, user_id")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("cad_runs")
      .select("id, status, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const profiles = profilesRes.data ?? [];
  const jobs = jobsRes.data ?? [];
  const cadRuns = cadRunsRes.data ?? [];

  // ── Stats ──────────────────────────────────────────────────────────────────
  const totalUsers = profiles.length;
  const paidUsers = profiles.filter(
    (p) =>
      (p.plan === "maker" || p.plan === "pro") &&
      p.subscription_status === "active"
  ).length;

  const totalGenerations = cadRuns.length;
  const failedGenerations = cadRuns.filter((r) => r.status === "failed").length;
  const failedRate =
    totalGenerations > 0
      ? Math.round((failedGenerations / totalGenerations) * 100)
      : 0;

  const makerCount = profiles.filter(
    (p) => p.plan === "maker" && p.subscription_status === "active"
  ).length;
  const proCount = profiles.filter(
    (p) => p.plan === "pro" && p.subscription_status === "active"
  ).length;
  const revenueThisMonth = makerCount * 9 + proCount * 29;

  // Most popular part families
  const familyCounts: Record<string, number> = {};
  for (const j of jobs) {
    const fam = (j.selected_family as string | null) ?? "unknown";
    familyCounts[fam] = (familyCounts[fam] ?? 0) + 1;
  }
  const topFamilies = Object.entries(familyCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  const planBreakdown: Record<string, number> = {};
  for (const p of profiles) {
    const plan = (p.plan as string) ?? "free";
    planBreakdown[plan] = (planBreakdown[plan] ?? 0) + 1;
  }

  const jobsByStatus: Record<string, number> = {};
  for (const j of jobs) {
    jobsByStatus[j.status] = (jobsByStatus[j.status] ?? 0) + 1;
  }

  return (
    <div className="min-h-screen bg-steel-900">
      <header className="border-b border-steel-800 px-4 sm:px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-sm">A</span>
          </div>
          <span className="font-semibold text-steel-100">Admin Dashboard</span>
          <span className="text-xs bg-red-900/50 text-red-400 border border-red-800 px-2 py-0.5 rounded-full">
            Owner Only
          </span>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/admin/users"
            className="text-steel-400 hover:text-steel-200 text-sm transition-colors"
          >
            Users
          </Link>
          <Link
            href="/admin/jobs"
            className="text-steel-400 hover:text-steel-200 text-sm transition-colors"
          >
            Jobs
          </Link>
          <Link
            href="/dashboard"
            className="text-steel-400 hover:text-steel-200 text-sm transition-colors"
          >
            User Dashboard
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-8">
        {/* Platform stats */}
        <section>
          <h2 className="text-sm font-medium text-steel-400 uppercase tracking-wide mb-4">
            Platform Overview
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label="Total Users"
              value={totalUsers}
              icon="👥"
              href="/admin/users"
              sub={`${paidUsers} paid`}
            />
            <StatCard
              label="Total Generations"
              value={totalGenerations}
              icon="⚙️"
              sub={`${failedRate}% failed`}
            />
            <StatCard
              label="Failed Generation Rate"
              value={`${failedRate}%`}
              icon={failedRate > 20 ? "🔴" : failedRate > 10 ? "🟡" : "🟢"}
              sub={`${failedGenerations} of ${totalGenerations}`}
            />
            <StatCard
              label="Revenue This Month"
              value={`$${revenueThisMonth}`}
              icon="💰"
              sub={`${makerCount} Maker · ${proCount} Pro`}
            />
          </div>
        </section>

        {/* Most popular part families */}
        <section>
          <h2 className="text-sm font-medium text-steel-400 uppercase tracking-wide mb-4">
            Most Popular Part Families
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {topFamilies.length === 0 ? (
              <p className="text-steel-500 text-sm col-span-3">No jobs yet.</p>
            ) : (
              topFamilies.map(([family, count]) => (
                <div key={family} className="card flex items-center gap-3">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-steel-200 capitalize">
                      {family.replace(/_/g, " ")}
                    </div>
                    <div className="text-xs text-steel-500 mt-0.5">{count} jobs</div>
                  </div>
                  <div className="text-2xl font-bold text-brand-400">{count}</div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Plan + Job status breakdown */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <section>
            <h2 className="text-sm font-medium text-steel-400 uppercase tracking-wide mb-4">
              Plan Breakdown
            </h2>
            <div className="card space-y-3">
              {Object.entries(planBreakdown).map(([plan, count]) => (
                <div key={plan} className="flex items-center justify-between">
                  <span className="text-sm capitalize text-steel-300">{plan}</span>
                  <div className="flex items-center gap-3">
                    <div className="w-32 bg-steel-700 rounded-full h-2">
                      <div
                        className="bg-brand-500 h-2 rounded-full"
                        style={{
                          width: `${totalUsers > 0 ? ((count as number) / totalUsers) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <span className="text-sm text-steel-400 w-8 text-right">
                      {count as number}
                    </span>
                  </div>
                </div>
              ))}
              {Object.keys(planBreakdown).length === 0 && (
                <p className="text-steel-500 text-sm">No users yet.</p>
              )}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-medium text-steel-400 uppercase tracking-wide mb-4">
              Job Status Breakdown
            </h2>
            <div className="card space-y-3">
              {Object.entries(jobsByStatus).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between">
                  <span className="text-sm capitalize text-steel-300">
                    {status.replace(/_/g, " ")}
                  </span>
                  <div className="flex items-center gap-3">
                    <div className="w-32 bg-steel-700 rounded-full h-2">
                      <div
                        className="bg-brand-500 h-2 rounded-full"
                        style={{
                          width: `${jobs.length > 0 ? ((count as number) / jobs.length) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <span className="text-sm text-steel-400 w-8 text-right">
                      {count as number}
                    </span>
                  </div>
                </div>
              ))}
              {Object.keys(jobsByStatus).length === 0 && (
                <p className="text-steel-500 text-sm">No jobs yet.</p>
              )}
            </div>
          </section>
        </div>

        {/* Recent users */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-steel-400 uppercase tracking-wide">
              Recent Users
            </h2>
            <Link
              href="/admin/users"
              className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
            >
              View all
            </Link>
          </div>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-steel-500 text-xs border-b border-steel-700">
                  <th className="text-left py-2 pr-4 font-medium">User ID</th>
                  <th className="text-left py-2 pr-4 font-medium">Plan</th>
                  <th className="text-left py-2 pr-4 font-medium">Role</th>
                  <th className="text-left py-2 pr-4 font-medium">Gens/Mo</th>
                  <th className="text-left py-2 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-800">
                {profiles.slice(0, 20).map((p) => (
                  <tr key={p.id} className="hover:bg-steel-800/30 transition-colors">
                    <td className="py-2 pr-4 font-mono text-xs text-steel-400">
                      {(p.id as string).slice(0, 8)}...
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full capitalize ${
                          p.plan === "pro"
                            ? "bg-purple-900/50 text-purple-300 border border-purple-800"
                            : p.plan === "maker"
                            ? "bg-brand-900/50 text-brand-300 border border-brand-800"
                            : "bg-steel-700 text-steel-300"
                        }`}
                      >
                        {(p.plan as string) ?? "free"}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-steel-400 text-xs capitalize">
                      {(p.role as string) ?? "builder"}
                    </td>
                    <td className="py-2 pr-4 text-steel-400 text-xs">
                      {(p.generations_this_month as number) ?? 0}
                    </td>
                    <td className="py-2 text-steel-500 text-xs">
                      {new Date(p.created_at as string).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Recent jobs */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-steel-400 uppercase tracking-wide">
              Recent Jobs
            </h2>
            <Link
              href="/admin/jobs"
              className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
            >
              View all
            </Link>
          </div>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-steel-500 text-xs border-b border-steel-700">
                  <th className="text-left py-2 pr-4 font-medium">Title</th>
                  <th className="text-left py-2 pr-4 font-medium">Family</th>
                  <th className="text-left py-2 pr-4 font-medium">Status</th>
                  <th className="text-left py-2 pr-4 font-medium">User</th>
                  <th className="text-left py-2 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-800">
                {jobs.slice(0, 20).map((j) => (
                  <tr key={j.id} className="hover:bg-steel-800/30 transition-colors">
                    <td className="py-2 pr-4 text-steel-200 text-xs max-w-xs truncate">
                      {(j.title as string | null) ?? "Untitled"}
                    </td>
                    <td className="py-2 pr-4 text-steel-400 text-xs capitalize">
                      {(j.selected_family as string | null)?.replace(/_/g, " ") ?? "—"}
                    </td>
                    <td className="py-2 pr-4">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-steel-700 text-steel-300 capitalize">
                        {(j.status as string).replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs text-steel-500">
                      {(j.user_id as string).slice(0, 8)}...
                    </td>
                    <td className="py-2 text-steel-500 text-xs">
                      {new Date(j.created_at as string).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Operator Console Links */}
        <section>
          <h2 className="text-sm font-medium text-steel-400 uppercase tracking-wide mb-4">
            Operator Console
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Link href="/admin/vpl">
              <div className="card hover:border-brand-500/50 transition-colors cursor-pointer">
                <div className="text-2xl mb-2">🧪</div>
                <h3 className="font-semibold text-steel-100">Virtual Print Lab</h3>
                <p className="text-steel-500 text-xs mt-1">Geometry validation, slicer simulation, and printability scores</p>
              </div>
            </Link>
            <Link href="/admin/queue">
              <div className="card hover:border-brand-500/50 transition-colors cursor-pointer">
                <div className="text-2xl mb-2">📋</div>
                <h3 className="font-semibold text-steel-100">Job Queue</h3>
                <p className="text-steel-500 text-xs mt-1">Live pipeline viewer — in-flight, failed, all jobs</p>
              </div>
            </Link>
            <Link href="/admin/feedback">
              <div className="card hover:border-brand-500/50 transition-colors cursor-pointer">
                <div className="text-2xl mb-2">🖨️</div>
                <h3 className="font-semibold text-steel-100">Print Feedback</h3>
                <p className="text-steel-500 text-xs mt-1">Review user print results and AI analysis</p>
              </div>
            </Link>
            <Link href="/admin/intelligence">
              <div className="card hover:border-brand-500/50 transition-colors cursor-pointer">
                <div className="text-2xl mb-2">🧠</div>
                <h3 className="font-semibold text-steel-100">Intelligence Console</h3>
                <p className="text-steel-500 text-xs mt-1">Harmonia debates, tolerance insights, capabilities</p>
              </div>
            </Link>
          </div>
        </section>

        {/* Owner setup instructions */}
        <section>
          <h2 className="text-sm font-medium text-steel-400 uppercase tracking-wide mb-4">
            Owner Setup Instructions
          </h2>
          <div className="card space-y-6 text-sm text-steel-300">
            <div>
              <h3 className="font-semibold text-steel-200 mb-2">
                1. Required Environment Variables (Vercel)
              </h3>
              <div className="bg-steel-800 rounded-lg p-4 font-mono text-xs space-y-1 text-steel-400">
                <div>NEXT_PUBLIC_SUPABASE_URL</div>
                <div>NEXT_PUBLIC_SUPABASE_ANON_KEY</div>
                <div>SUPABASE_SERVICE_ROLE_KEY</div>
                <div>OPENAI_API_KEY</div>
                <div>STRIPE_SECRET_KEY</div>
                <div>STRIPE_WEBHOOK_SECRET</div>
                <div>STRIPE_PRICE_ID_MAKER</div>
                <div>STRIPE_PRICE_ID_PRO</div>
                <div>RESEND_API_KEY</div>
                <div>RESEND_FROM_EMAIL</div>
                <div>TRIGGER_SECRET_KEY</div>
              </div>
            </div>
            <div>
              <h3 className="font-semibold text-steel-200 mb-2">
                2. Database Migrations
              </h3>
              <div className="bg-steel-800 rounded-lg p-3 font-mono text-xs text-steel-400 space-y-1">
                <div>packages/db/schema.sql</div>
                <div>packages/db/migrations/001_printer_profiles.sql</div>
                <div>packages/db/migrations/002_print_feedback.sql</div>
                <div>packages/db/migrations/003_tags_and_sharing.sql</div>
              </div>
            </div>
            <div>
              <h3 className="font-semibold text-steel-200 mb-2">
                3. Grant Admin Role
              </h3>
              <div className="bg-steel-800 rounded-lg p-3 font-mono text-xs text-steel-400">
                UPDATE profiles SET role = &apos;admin&apos; WHERE id = &apos;YOUR_USER_UUID&apos;;
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
