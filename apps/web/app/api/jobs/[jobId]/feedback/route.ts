/**
 * POST /api/jobs/[jobId]/feedback
 * GET  /api/jobs/[jobId]/feedback
 *
 * Stores and retrieves print feedback for a completed job.
 *
 * Phase 2E: Print feedback loop
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface RouteContext {
  params: Promise<{ jobId: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { jobId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("print_feedback")
    .select("*")
    .eq("job_id", jobId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ feedback: data });
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { jobId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify job belongs to user
  const { data: job } = await supabase
    .from("jobs")
    .select("id, status")
    .eq("id", jobId)
    .eq("user_id", user.id)
    .single();

  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    overall_rating,
    fit_rating,
    quality_rating,
    printed_successfully,
    failure_reason,
    notes,
    printer_name,
    material,
    layer_height_mm,
    artifact_id,
  } = body as {
    overall_rating: number;
    fit_rating?: number;
    quality_rating?: number;
    printed_successfully?: boolean;
    failure_reason?: string;
    notes?: string;
    printer_name?: string;
    material?: string;
    layer_height_mm?: number;
    artifact_id?: string;
  };

  if (!overall_rating || overall_rating < 1 || overall_rating > 5) {
    return NextResponse.json(
      { error: "overall_rating must be between 1 and 5" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("print_feedback")
    .insert({
      job_id: jobId,
      user_id: user.id,
      artifact_id: artifact_id ?? null,
      overall_rating,
      fit_rating: fit_rating ?? null,
      quality_rating: quality_rating ?? null,
      printed_successfully: printed_successfully ?? true,
      failure_reason: failure_reason ?? null,
      notes: notes ?? null,
      printer_name: printer_name ?? null,
      material: material ?? null,
      layer_height_mm: layer_height_mm ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ feedback: data }, { status: 201 });
}
