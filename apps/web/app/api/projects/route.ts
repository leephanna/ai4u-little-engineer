/**
 * POST /api/projects
 *
 * Saves a completed job as a reusable project in the library.
 *
 * Request body:
 *   - job_id: string   — the completed job to save
 *   - title: string    — project title
 *   - description: string (optional)
 *
 * Phase 6: Searchable project library
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { job_id: string; title: string; description?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { job_id, title, description } = body;
  if (!job_id || !title?.trim()) {
    return NextResponse.json({ error: "job_id and title are required" }, { status: 400 });
  }

  // Load the job
  const { data: job } = await supabase
    .from("jobs")
    .select("id, user_id, selected_family, final_spec, status")
    .eq("id", job_id)
    .eq("user_id", user.id)
    .single();

  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (job.status !== "approved" && job.status !== "printed") {
    return NextResponse.json({ error: "Only approved or printed jobs can be saved" }, { status: 400 });
  }

  // Load the latest artifact for STL/STEP URLs
  const { data: artifact } = await supabase
    .from("cad_runs")
    .select("stl_url, step_url")
    .eq("job_id", job_id)
    .eq("status", "success")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const serviceClient = createServiceClient();

  // Check if already saved
  const { data: existing } = await serviceClient
    .from("projects")
    .select("id")
    .eq("created_by", user.id)
    .eq("title", title.trim())
    .single();

  if (existing) {
    return NextResponse.json({ id: existing.id, saved: true, already_existed: true });
  }

  const { data: project, error } = await serviceClient
    .from("projects")
    .insert({
      title: title.trim(),
      description: description?.trim() ?? null,
      family: job.selected_family as string,
      parameters: (job.final_spec as Record<string, unknown>) ?? {},
      stl_url: (artifact?.stl_url as string | null) ?? null,
      step_url: (artifact?.step_url as string | null) ?? null,
      created_by: user.id,
      is_system: false,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to save project:", error.message);
    return NextResponse.json({ error: "Failed to save project" }, { status: 500 });
  }

  return NextResponse.json({ id: project.id, saved: true });
}
