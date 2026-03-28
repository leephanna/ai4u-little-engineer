/**
 * POST /api/mobile/confirm-spec
 *
 * Creates a job + part_spec row from a confirmed PartSpecDraft.
 * Returns the job object including part_spec_id so the mobile app
 * can immediately call /api/jobs/[id]/generate.
 *
 * Auth: Bearer token.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { MVP_PART_FAMILIES, REQUIRED_DIMENSIONS } from "@ai4u/shared";

export async function POST(request: NextRequest) {
  try {
    // Auth
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { spec } = body;

    if (!spec?.family) {
      return NextResponse.json(
        { error: "spec.family is required" },
        { status: 400 }
      );
    }

    if (!MVP_PART_FAMILIES.includes(spec.family)) {
      return NextResponse.json(
        { error: `Unsupported part family: ${spec.family}` },
        { status: 400 }
      );
    }

    // Validate all required dimensions are present
    const required = REQUIRED_DIMENSIONS[spec.family as keyof typeof REQUIRED_DIMENSIONS] ?? [];
    const missing = required.filter(
      (f: string) =>
        spec.dimensions?.[f] === undefined ||
        spec.dimensions?.[f] === null ||
        isNaN(spec.dimensions?.[f])
    );
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required dimensions: ${missing.join(", ")}` },
        { status: 400 }
      );
    }

    // Use service role client to create the job and part_spec
    const serviceClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1. Create job row
    const { data: job, error: jobErr } = await serviceClient
      .from("jobs")
      .insert({
        user_id: user.id,
        status: "draft",
        title: `${spec.family.replace(/_/g, " ")} — mobile`,
        source: "mobile",
      })
      .select()
      .single();

    if (jobErr || !job) {
      console.error("Failed to create job:", jobErr);
      return NextResponse.json(
        { error: "Failed to create job" },
        { status: 500 }
      );
    }

    // 2. Create part_spec row
    const { data: partSpec, error: specErr } = await serviceClient
      .from("part_specs")
      .insert({
        job_id: job.id,
        user_id: user.id,
        family: spec.family,
        dimensions_json: spec.dimensions,
        units: spec.units || "mm",
        material: spec.material || "Unknown",
        source: "mobile_voice",
      })
      .select()
      .single();

    if (specErr || !partSpec) {
      console.error("Failed to create part_spec:", specErr);
      return NextResponse.json(
        { error: "Failed to create part spec" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ...job,
      part_spec_id: partSpec.id,
    });
  } catch (err: unknown) {
    console.error("[/api/mobile/confirm-spec]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
