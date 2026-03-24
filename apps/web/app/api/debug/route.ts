import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const serviceSupabase = await createServiceClient();
    
    const { data, error } = await serviceSupabase
      .from("cad_runs")
      .insert({
        job_id: body.job_id,
        part_spec_id: body.part_spec_id,
        engine: "build123d",
        generator_name: "spacer",
        generator_version: "1.0.0",
        status: "queued",
        normalized_params_json: {},
        validation_report_json: {},
      })
      .select()
      .single();
    
    return NextResponse.json({ data, error });
  } catch (err) {
    return NextResponse.json({ caught: String(err) });
  }
}
