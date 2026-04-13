/**
 * GET /api/mobile/job-status?job_id=<id>
 *
 * Returns the current job status, artifacts, and signed download URLs.
 * Used by the mobile app to poll for generation progress.
 *
 * Auth: Bearer token.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getAuthUser } from "@/lib/auth";

const SIGNED_URL_EXPIRY_SECONDS = 3600; // 1 hour

export async function GET(request: NextRequest) {
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
        const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const jobId = request.nextUrl.searchParams.get("job_id");
    if (!jobId) {
      return NextResponse.json(
        { error: "job_id query parameter is required" },
        { status: 400 }
      );
    }

    // Use service role for reading artifacts (storage paths are private)
    const serviceClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Fetch job (verify ownership)
    const { data: job, error: jobErr } = await serviceClient
      .from("jobs")
      .select("*")
      .eq("id", jobId)
      .eq("clerk_user_id", user.id)
      .single();

    if (jobErr || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Fetch artifacts
    const { data: artifacts, error: artErr } = await serviceClient
      .from("artifacts")
      .select("*")
      .eq("job_id", jobId);

    if (artErr) {
      console.error("Failed to fetch artifacts:", artErr);
    }

    // Generate signed download URLs for each artifact
    const downloadUrls: Record<string, string> = {};
    if (artifacts?.length) {
      for (const artifact of artifacts) {
        if (artifact.storage_path) {
          const { data: signedData } = await serviceClient.storage
            .from("cad-artifacts")
            .createSignedUrl(artifact.storage_path, SIGNED_URL_EXPIRY_SECONDS);
          if (signedData?.signedUrl) {
            downloadUrls[artifact.id] = signedData.signedUrl;
          }
        }
      }
    }

    return NextResponse.json({
      job,
      artifacts: artifacts || [],
      download_urls: downloadUrls,
    });
  } catch (err: unknown) {
    console.error("[/api/mobile/job-status]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
