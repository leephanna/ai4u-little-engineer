/**
 * POST /api/webhooks/cad-worker
 *
 * NOTIFICATION-ONLY endpoint called by the Trigger.dev cad-generation-pipeline
 * task after it has finished writing all DB state.
 *
 * ── Single-writer model ──────────────────────────────────────────────────────
 * The Trigger.dev pipeline is the SOLE authoritative DB writer for:
 *   - cad_runs  (status, validation_report_json, error_text, ended_at, …)
 *   - artifacts (storage_path, local_only, mime_type, …)
 *   - jobs      (status, latest_run_id)
 *
 * This webhook MUST NOT touch those tables. Its only responsibilities are:
 *   1. Verify the shared WEBHOOK_SECRET so only Trigger.dev can call it.
 *   2. Log the notification for observability / debugging.
 *   3. (Optional) Trigger any side-effects that are NOT DB writes — e.g.
 *      sending a push notification, emitting a Sentry breadcrumb, or
 *      invalidating a CDN cache. Add those here, never DB mutations.
 *
 * Rationale: if both the pipeline and this webhook wrote to the same rows,
 * the result would be duplicate artifact inserts and conflicting status
 * updates. The pipeline already handles all state transitions atomically
 * with proper error handling and retry logic via Trigger.dev.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { NextRequest, NextResponse } from "next/server";

interface CadWorkerNotification {
  job_id: string;
  cad_run_id: string;
  /** Final status written by the Trigger.dev pipeline to cad_runs.status */
  status: "success" | "degraded_local" | "failed";
  /** Number of artifact rows the pipeline inserted */
  artifact_count: number;
  duration_ms: number;
  /** Present when status === 'failed' */
  error?: string;
  /** Present when status === 'failed' */
  failure_stage?: string;
}

export async function POST(request: NextRequest) {
  try {
    // ── 1. Verify webhook secret ──────────────────────────────────────────
    const webhookSecret = process.env.WEBHOOK_SECRET;
    if (webhookSecret) {
      const authHeader = request.headers.get("x-webhook-secret");
      if (authHeader !== webhookSecret) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const notification: CadWorkerNotification = await request.json();
    const { job_id, cad_run_id, status, artifact_count, duration_ms, error, failure_stage } =
      notification;

    // ── 2. Log for observability ──────────────────────────────────────────
    // This is the only action this endpoint takes. All DB state was already
    // written by the Trigger.dev pipeline before this call was made.
    console.log(
      `[cad-worker webhook] NOTIFICATION ONLY — no DB writes performed here. ` +
        `job=${job_id} run=${cad_run_id} status=${status} ` +
        `artifacts=${artifact_count} duration=${duration_ms}ms` +
        (error ? ` error="${error}" stage=${failure_stage}` : "")
    );

    // ── 3. Optional side-effects (non-DB) ────────────────────────────────
    // Examples of things that ARE appropriate here:
    //   - Send a push notification to the user's device
    //   - Emit a Sentry breadcrumb / custom event
    //   - Invalidate a Next.js on-demand revalidation tag
    //   - Post a Slack/Discord message to an ops channel
    //
    // Example (uncomment and implement as needed):
    //
    // if (status === "success") {
    //   await sendPushNotification(job_id, "Your part is ready to review!");
    // }
    //
    // if (status === "failed") {
    //   await notifyOpsChannel(`CAD run failed: job=${job_id} stage=${failure_stage}`);
    // }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[cad-worker webhook] Error processing notification:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
