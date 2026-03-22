import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// PUT /api/jobs/[jobId]/tags  → update tags array
export async function PUT(
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
    .select("id, user_id")
    .eq("id", jobId)
    .single();

  if (fetchErr || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const tags: string[] = Array.isArray((body as { tags?: unknown }).tags)
    ? ((body as { tags: unknown[] }).tags as string[])
        .map((t) => String(t).toLowerCase().trim().replace(/\s+/g, "-"))
        .filter(Boolean)
        .slice(0, 20) // max 20 tags
    : [];

  const { error } = await supabase
    .from("jobs")
    .update({ tags })
    .eq("id", jobId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ tags });
}

// GET /api/jobs/[jobId]/tags  → return current tags
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
    .select("id, user_id, tags")
    .eq("id", jobId)
    .single();

  if (error || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ tags: job.tags ?? [] });
}
