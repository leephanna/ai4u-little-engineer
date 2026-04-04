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
 * Visual-proof pass fixes:
 *   1. Allow "completed" status (Artemis II jobs land here, not "approved")
 *   2. Set BOTH creator_id AND created_by on insert so the images API
 *      ownership check (which uses creator_id) works correctly
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

  // Allow approved, printed, AND completed (Artemis II jobs land in "completed")
  const savableStatuses = ["approved", "printed", "completed"];
  if (!savableStatuses.includes(job.status as string)) {
    return NextResponse.json(
      { error: `Only ${savableStatuses.join(", ")} jobs can be saved` },
      { status: 400 }
    );
  }

  // Load the latest successful CAD run for STL/STEP URLs
  const { data: cadRun } = await supabase
    .from("cad_runs")
    .select("stl_url, step_url")
    .eq("job_id", job_id)
    .eq("status", "success")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const serviceClient = createServiceClient();

  // Check if already saved (check both creator_id and created_by for safety)
  const { data: existing } = await serviceClient
    .from("projects")
    .select("id")
    .or(`created_by.eq.${user.id},creator_id.eq.${user.id}`)
    .eq("title", title.trim())
    .limit(1)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ id: existing.id, saved: true, already_existed: true });
  }

  // Insert project — set BOTH creator_id and created_by so all ownership checks pass
  const { data: project, error } = await serviceClient
    .from("projects")
    .insert({
      title: title.trim(),
      description: description?.trim() ?? null,
      family: (job.selected_family as string) ?? "mechanical_part",
      parameters: (job.final_spec as Record<string, unknown>) ?? {},
      stl_url: (cadRun?.stl_url as string | null) ?? null,
      step_url: (cadRun?.step_url as string | null) ?? null,
      created_by: user.id,
      creator_id: user.id,   // ← also set creator_id (migration 006 column)
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
