/**
 * Admin Dashboard — Phase 3E
 *
 * Protected by ADMIN_EMAIL env var check.
 * Shows platform stats, user list, and recent jobs.
 */

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

function StatCard({
  label,
  value,
  icon,
  sub,
}: {
  label: string;
  value: string | number;
  icon: string;
  sub?: string;
}) {
  return (
    <div className="card text-center">
      <div className="text-2xl mb-1">{icon}</div>
      <div className="text-3xl font-bold text-steel-100">{value}</div>
      <div className="text-xs text-steel-400 mt-1">{label}</div>
      {sub && <div className="text-xs text-steel-600 mt-0.5">{sub}</div>}
    </div>
  );
}

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail || user.email !== adminEmail) {
    redirect("/dashboard");
  }

  const [profilesRes, jobsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, plan, generations_this_month, created_at")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("jobs")
      .select("id, title, status, selected_family, created_at, user_id")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const profiles = profilesRes.data ?? [];
  const jobs = jobsRes.data ?? [];

  const totalUsers = profiles.length;
  const paidUsers = profiles.filter(
    (p) => p.plan === "maker" || p.plan === "pro"
  ).length;
  const totalJobs = jobs.length;
  const totalGenerations = profiles.reduce(
    (sum, p) => sum + ((p.generations_this_month as number) ?? 0),
    0
  );
  const jobsByStatus = jobs.reduce(
    (acc, j) => {
      acc[j.status] = (acc[j.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const planBreakdown = profiles.reduce(
    (acc, p) => {
      const plan = (p.plan as string) ?? "free";
      acc[plan] = (acc[plan] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="min-h-screen bg-steel-900">
      <header className="border-b border-steel-800 px-4 sm:px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-sm">⚙</span>
          </div>
          <span className="font-semibold text-steel-100">Admin Dashboard</span>
          <span className="text-xs bg-red-900/50 text-red-400 border border-red-800 px-2 py-0.5 rounded-full">
            Owner Only
          </span>
        </div>
        <Link
          href="/dashboard"
          className="text-steel-400 hover:text-steel-200 text-sm transition-colors"
        >
          ← User Dashboard
        </Link>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-8">
        {/* Platform stats */}
        <section>
          <h2 className="text-sm font-medium text-steel-400 uppercase tracking-wide mb-4">
            Platform Overview
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total Users" value={totalUsers} icon="👥" />
            <StatCard
              label="Paid Users"
              value={paidUsers}
              icon="💳"
              sub={`${totalUsers > 0 ? Math.round((paidUsers / totalUsers) * 100) : 0}% conversion`}
            />
            <StatCard label="Total Jobs" value={totalJobs} icon="📋" />
            <StatCard
              label="Generations This Month"
              value={totalGenerations}
              icon="⚙️"
            />
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
                          width: `${totalUsers > 0 ? (count / totalUsers) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <span className="text-sm text-steel-400 w-8 text-right">
                      {count}
                    </span>
                  </div>
                </div>
              ))}
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
                          width: `${totalJobs > 0 ? (count / totalJobs) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <span className="text-sm text-steel-400 w-8 text-right">
                      {count}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Recent users */}
        <section>
          <h2 className="text-sm font-medium text-steel-400 uppercase tracking-wide mb-4">
            Recent Users
          </h2>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-steel-500 text-xs border-b border-steel-700">
                  <th className="text-left pb-2 pr-4">User ID</th>
                  <th className="text-left pb-2 pr-4">Plan</th>
                  <th className="text-left pb-2 pr-4">Generations</th>
                  <th className="text-left pb-2">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-800">
                {profiles.slice(0, 20).map((p) => (
                  <tr key={p.id} className="text-steel-300">
                    <td className="py-2 pr-4 font-mono text-xs text-steel-500">
                      {p.id.slice(0, 8)}…
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full capitalize ${
                          p.plan === "pro"
                            ? "bg-purple-900/50 text-purple-300"
                            : p.plan === "maker"
                            ? "bg-brand-900/50 text-brand-300"
                            : "bg-steel-700 text-steel-400"
                        }`}
                      >
                        {(p.plan as string) ?? "free"}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-steel-400">
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
          <h2 className="text-sm font-medium text-steel-400 uppercase tracking-wide mb-4">
            Recent Jobs
          </h2>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-steel-500 text-xs border-b border-steel-700">
                  <th className="text-left pb-2 pr-4">Title</th>
                  <th className="text-left pb-2 pr-4">Family</th>
                  <th className="text-left pb-2 pr-4">Status</th>
                  <th className="text-left pb-2 pr-4">User</th>
                  <th className="text-left pb-2">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-800">
                {jobs.map((j) => (
                  <tr key={j.id} className="text-steel-300">
                    <td className="py-2 pr-4 max-w-[200px] truncate">
                      <Link
                        href={`/jobs/${j.id}`}
                        className="hover:text-brand-300 transition-colors"
                      >
                        {j.title}
                      </Link>
                    </td>
                    <td className="py-2 pr-4 text-steel-400 capitalize text-xs">
                      {(j.selected_family as string | null)?.replace(/_/g, " ") ?? "—"}
                    </td>
                    <td className="py-2 pr-4">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-steel-700 text-steel-300 capitalize">
                        {j.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs text-steel-500">
                      {(j.user_id as string).slice(0, 8)}…
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

        {/* Owner instructions */}
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
                <div>NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co</div>
                <div>NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...</div>
                <div>SUPABASE_SERVICE_ROLE_KEY=eyJ...</div>
                <div>OPENAI_API_KEY=sk-...</div>
                <div>STRIPE_SECRET_KEY=sk_live_...</div>
                <div>STRIPE_WEBHOOK_SECRET=whsec_...</div>
                <div>STRIPE_MAKER_PRICE_ID=price_...</div>
                <div>STRIPE_PRO_PRICE_ID=price_...</div>
                <div>RESEND_API_KEY=re_...</div>
                <div>RESEND_FROM_EMAIL=noreply@yourdomain.com</div>
                <div>ADMIN_EMAIL=your@email.com</div>
              </div>
            </div>
            <div>
              <h3 className="font-semibold text-steel-200 mb-2">
                2. Database Migrations (run in order via Supabase SQL editor)
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
                3. Stripe Setup
              </h3>
              <ol className="list-decimal list-inside text-steel-400 text-xs space-y-1">
                <li>Create two products in Stripe: Maker ($9/mo) and Pro ($29/mo)</li>
                <li>Copy the Price IDs to STRIPE_MAKER_PRICE_ID and STRIPE_PRO_PRICE_ID</li>
                <li>Add webhook: https://your-domain.vercel.app/api/billing/webhook</li>
                <li>Subscribe to: customer.subscription.created/updated/deleted, checkout.session.completed</li>
                <li>Copy webhook signing secret to STRIPE_WEBHOOK_SECRET</li>
              </ol>
            </div>
            <div>
              <h3 className="font-semibold text-steel-200 mb-2">
                4. CAD Worker (Docker / Cloud Run)
              </h3>
              <div className="bg-steel-800 rounded-lg p-3 font-mono text-xs text-steel-400 space-y-1">
                <div>cd apps/cad-worker</div>
                <div>docker build -t ai4u-cad-worker .</div>
                <div>gcloud run deploy ai4u-cad-worker --image ai4u-cad-worker \</div>
                <div>  --platform managed --region us-central1 \</div>
                <div>  --set-env-vars SUPABASE_URL=...,SUPABASE_SERVICE_ROLE_KEY=...</div>
              </div>
            </div>
            <div>
              <h3 className="font-semibold text-steel-200 mb-2">
                5. Smoke Test Sequence
              </h3>
              <ol className="list-decimal list-inside text-steel-400 text-xs space-y-1">
                <li>Sign up with a new account at /signup</li>
                <li>Create a new part job at /jobs/new</li>
                <li>Verify job appears in dashboard with correct status</li>
                <li>Check /api/admin/system-health returns all services</li>
                <li>Test Stripe checkout at /pricing (use test card 4242 4242 4242 4242)</li>
                <li>Verify subscription updates in Supabase profiles table</li>
                <li>Test share link generation in job detail page</li>
                <li>Verify /share/[token] page loads without login</li>
              </ol>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
