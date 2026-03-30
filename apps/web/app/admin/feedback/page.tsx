/**
 * /admin/feedback — Print feedback review panel
 *
 * Shows all pending print feedback with images and analysis results.
 * Operator can mark feedback as reviewed.
 *
 * Phase 4: Operator console
 */

import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { FeedbackReviewButton } from "./FeedbackReviewButton";

export const metadata = { title: "Feedback Review — Admin" };
export const revalidate = 60;

interface FeedbackRow {
  id: string;
  job_id: string;
  user_id: string;
  overall_rating: number | null;
  fit_result: string | null;
  material: string | null;
  notes: string | null;
  image_path: string | null;
  analysis_result: Record<string, unknown> | null;
  review_status: string | null;
  created_at: string;
  printed: boolean | null;
}

export default async function FeedbackPage() {
  const supabase = await createClient();

  const { data: feedback } = await supabase
    .from("print_feedback")
    .select("id, job_id, user_id, overall_rating, fit_result, material, notes, image_path, analysis_result, review_status, created_at, printed")
    .order("created_at", { ascending: false })
    .limit(100);

  const items = (feedback ?? []) as FeedbackRow[];
  const pending = items.filter((f) => f.review_status === "pending");
  const reviewed = items.filter((f) => f.review_status === "reviewed");

  return (
    <div className="min-h-screen bg-steel-900">
      <nav className="border-b border-steel-800 px-6 py-4 flex items-center gap-4">
        <Link href="/admin" className="text-steel-400 hover:text-steel-100 text-sm">
          ← Admin
        </Link>
        <span className="text-steel-600">/</span>
        <span className="text-steel-200 font-semibold text-sm">Feedback Review</span>
      </nav>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-steel-100">Print Feedback</h1>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-yellow-400">{pending.length} pending</span>
            <span className="text-steel-500">{reviewed.length} reviewed</span>
          </div>
        </div>

        {/* Pending */}
        {pending.length > 0 ? (
          <section>
            <h2 className="text-sm font-semibold text-yellow-400 uppercase tracking-wide mb-3">
              Pending Review
            </h2>
            <div className="space-y-4">
              {pending.map((f) => (
                <FeedbackCard key={f.id} f={f} showAction />
              ))}
            </div>
          </section>
        ) : (
          <div className="card text-center py-10 text-steel-500">
            No pending feedback — all caught up!
          </div>
        )}

        {/* Reviewed */}
        {reviewed.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-steel-400 uppercase tracking-wide mb-3">
              Reviewed
            </h2>
            <div className="space-y-3">
              {reviewed.slice(0, 20).map((f) => (
                <FeedbackCard key={f.id} f={f} showAction={false} />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function StarRating({ rating }: { rating: number | null }) {
  if (!rating) return <span className="text-steel-600 text-xs">No rating</span>;
  return (
    <span className="text-yellow-400 text-sm">
      {"★".repeat(rating)}{"☆".repeat(5 - rating)}
    </span>
  );
}

function FeedbackCard({
  f,
  showAction,
}: {
  f: FeedbackRow;
  showAction: boolean;
}) {
  const analysis = f.analysis_result;

  return (
    <div className="card space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <StarRating rating={f.overall_rating} />
            {f.fit_result && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-steel-700 text-steel-300 capitalize">
                {f.fit_result.replace(/_/g, " ")}
              </span>
            )}
            {f.printed === false && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-900/50 text-red-300">
                Not printed
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-steel-500">
            <span>Job: <span className="font-mono">{f.job_id.slice(0, 8)}…</span></span>
            <span>User: <span className="font-mono">{f.user_id.slice(0, 8)}…</span></span>
            {f.material && <span>Material: {f.material}</span>}
            <span>{new Date(f.created_at).toLocaleDateString()}</span>
          </div>
        </div>
        {showAction && <FeedbackReviewButton feedbackId={f.id} />}
      </div>

      {f.notes && (
        <p className="text-steel-300 text-sm italic">&ldquo;{f.notes}&rdquo;</p>
      )}

      {analysis && (
        <div className="bg-steel-800/50 rounded-lg p-3 text-xs text-steel-400 space-y-1">
          <p className="text-steel-300 font-medium text-xs uppercase tracking-wide mb-1">AI Analysis</p>
          {Object.entries(analysis).map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <span className="text-steel-500 capitalize">{k.replace(/_/g, " ")}:</span>
              <span className="text-steel-300">{String(v)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
