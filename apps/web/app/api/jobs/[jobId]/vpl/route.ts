import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(
  _req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const { jobId } = params;
  const supabase = createServiceClient();

  // Fetch the most recent VPL result for this job
  const { data, error } = await supabase
    .from("virtual_print_tests")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ vpl: null }, { status: 404 });
  }

  // Shape the response to match the VPLResult interface
  const vpl = {
    print_success_score: data.print_success_score,
    grade: data.grade,
    ready_to_print: data.ready_to_print,
    risk_level: data.risk_level,
    geometry_result: data.geometry_result,
    slicer_result: data.slicer_result,
    heuristic_result: data.heuristic_result,
    score_breakdown: data.score_breakdown,
    all_issues: data.all_issues ?? [],
    all_recommendations: data.all_recommendations ?? [],
    elapsed_seconds: data.elapsed_seconds,
  };

  return NextResponse.json({ vpl });
}
