/**
 * GET /api/artifacts/signed-url?job_id=...
 *
 * Returns a short-lived Supabase Storage signed URL for the STL artifact
 * of a given job. Used by the custom_preview panel in UniversalCreatorFlow
 * to render the inline 3D viewer without going through the auth-gated
 * /api/artifacts/[id]/download route (which requires a server component).
 *
 * Track 1 — Custom Viewer Parity:
 *   The custom_preview panel is a client component and cannot call
 *   createServiceClient() directly. This route bridges the gap.
 *
 * Security: Verifies job ownership via clerk_user_id before issuing URL.
 * URL expiry: 3600 seconds (1 hour) — same as job detail page.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getAuthUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const jobId = request.nextUrl.searchParams.get("job_id");
    if (!jobId) {
      return NextResponse.json({ error: "job_id is required" }, { status: 400 });
    }

    // ── Auth ──────────────────────────────────────────────────────────────────
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceClient();

    // ── Verify job ownership ──────────────────────────────────────────────────
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, clerk_user_id")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (job.clerk_user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // ── Find the STL artifact for this job ────────────────────────────────────
    const { data: artifact, error: artifactError } = await supabase
      .from("artifacts")
      .select("id, storage_path, kind")
      .eq("job_id", jobId)
      .eq("kind", "stl")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (artifactError || !artifact) {
      return NextResponse.json(
        { error: "No STL artifact found for this job" },
        { status: 404 }
      );
    }

    if (!artifact.storage_path) {
      return NextResponse.json(
        { error: "STL artifact has no storage path" },
        { status: 404 }
      );
    }

    // ── Generate signed URL (1 hour expiry) ───────────────────────────────────
    const { data: signed, error: signedError } = await supabase.storage
      .from("cad-artifacts")
      .createSignedUrl(artifact.storage_path, 3600);

    if (signedError || !signed?.signedUrl) {
      console.error("[signed-url] Failed to generate signed URL:", signedError);
      return NextResponse.json(
        { error: "Could not generate signed URL" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      signed_url: signed.signedUrl,
      artifact_id: artifact.id,
      storage_path: artifact.storage_path,
      expires_in: 3600,
    });
  } catch (err) {
    console.error("[signed-url] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
