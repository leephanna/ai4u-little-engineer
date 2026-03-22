/**
 * POST /api/webhooks/job-status
 *
 * Called by the CAD worker (or Supabase realtime trigger) when a job's
 * status changes to "completed" or "failed".
 *
 * Sends email notifications via Resend if the user has email enabled.
 *
 * Phase 3B: Email notifications
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  sendJobCompletedEmail,
  sendJobFailedEmail,
} from "@/lib/email/resend";

const WEBHOOK_SECRET = process.env.JOB_WEBHOOK_SECRET;

export async function POST(req: NextRequest) {
  // Verify shared secret
  const authHeader = req.headers.get("authorization");
  if (WEBHOOK_SECRET && authHeader !== `Bearer ${WEBHOOK_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    job_id: string;
    status: "completed" | "failed";
    error_text?: string;
    print_time_estimate_minutes?: number;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { job_id, status, error_text, print_time_estimate_minutes } = body;

  if (!job_id || !["completed", "failed"].includes(status)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const supabase = await createClient();

  // Fetch job + user email + profile preferences
  const { data: job } = await supabase
    .from("jobs")
    .select("id, title, user_id, latest_spec_version")
    .eq("id", job_id)
    .single();

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Fetch user email
  const { data: authUser } = await supabase.auth.admin.getUserById(job.user_id);
  const email = authUser?.user?.email;

  if (!email) {
    return NextResponse.json({ message: "No email for user, skipping" });
  }

  // Fetch the part family from the latest spec
  const { data: spec } = await supabase
    .from("part_specs")
    .select("family")
    .eq("job_id", job_id)
    .order("version", { ascending: false })
    .limit(1)
    .single();

  try {
    if (status === "completed") {
      await sendJobCompletedEmail({
        to: email,
        jobTitle: job.title,
        jobId: job.id,
        partFamily: spec?.family ?? "unknown",
        printTimeMinutes: print_time_estimate_minutes,
      });
    } else {
      await sendJobFailedEmail({
        to: email,
        jobTitle: job.title,
        jobId: job.id,
        errorText: error_text,
      });
    }
  } catch (err) {
    console.error("Email send error:", err);
    // Don't fail the webhook — email is best-effort
  }

  return NextResponse.json({ sent: true });
}
