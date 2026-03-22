import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { randomUUID } from "crypto";

// POST /api/jobs/[jobId]/share  → generate or revoke share token
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify ownership
  const { data: job, error: fetchErr } = await supabase
    .from("jobs")
    .select("id, user_id, share_token")
    .eq("id", jobId)
    .single();

  if (fetchErr || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const action = (body as { action?: string }).action ?? "enable";

  if (action === "disable") {
    // Revoke share token
    const { error } = await supabase
      .from("jobs")
      .update({ share_token: null })
      .eq("id", jobId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ shared: false, share_token: null });
  }

  // Enable sharing — generate token if not already set
  const token = job.share_token ?? randomUUID();
  const { error } = await supabase
    .from("jobs")
    .update({ share_token: token })
    .eq("id", jobId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ shared: true, share_token: token });
}

// GET /api/jobs/[jobId]/share → return current share status
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: job, error } = await supabase
    .from("jobs")
    .select("id, user_id, share_token")
    .eq("id", jobId)
    .single();

  if (error || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    shared: !!job.share_token,
    share_token: job.share_token ?? null,
  });
}
