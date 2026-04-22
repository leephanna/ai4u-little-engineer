/**
 * GET /api/artifacts/[id]/download
 *
 * Proxy-download an artifact from Supabase Storage.
 *
 * Design decisions:
 *   1. Uses clerk_user_id (not legacy user_id) for ownership verification.
 *   2. Proxies the file bytes server-side instead of redirecting to a signed URL.
 *      This avoids CORS issues, auth problems, and the "download.json" browser
 *      fallback that occurs when the redirect target is blocked.
 *   3. Sets Content-Disposition: attachment so the browser saves with the correct
 *      filename and extension (e.g. "spacer.stl", "enclosure.step").
 *   4. Signed URL expiry is 300 seconds — enough for the server-side proxy fetch.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth";

// Map artifact kind → file extension for Content-Disposition filename
const KIND_EXT: Record<string, string> = {
  stl: "stl",
  step: "step",
  json_receipt: "json",
  png: "png",
};

// Map artifact kind → MIME type (fallback to mime_type stored in DB)
const KIND_MIME: Record<string, string> = {
  stl: "model/stl",
  step: "application/step",
  json_receipt: "application/json",
  png: "image/png",
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: artifactId } = await params;

    // ── Auth ──────────────────────────────────────────────────────────────────
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Fetch artifact + verify ownership via clerk_user_id ───────────────────
    const serviceClient = await createServiceClient();

    // Use service client to bypass RLS (ownership check is manual below)
    const { data: artifact, error } = await serviceClient
      .from("artifacts")
      .select("id, storage_path, mime_type, kind, job_id")
      .eq("id", artifactId)
      .single();

    if (error || !artifact) {
      return NextResponse.json({ error: "Artifact not found" }, { status: 404 });
    }

    // Verify the job belongs to this user via clerk_user_id
    const { data: job, error: jobError } = await serviceClient
      .from("jobs")
      .select("clerk_user_id")
      .eq("id", artifact.job_id)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (job.clerk_user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // ── Guard: storage_path must be present ───────────────────────────────────
    if (!artifact.storage_path) {
      return NextResponse.json(
        { error: "Artifact file not yet available — generation may still be in progress" },
        { status: 404 }
      );
    }

    // ── Generate signed URL (300s — only used for server-side proxy fetch) ────
    const { data: signedUrlData, error: signedError } = await serviceClient.storage
      .from("cad-artifacts")
      .createSignedUrl(artifact.storage_path, 300);

    if (signedError || !signedUrlData?.signedUrl) {
      console.error("[download] Signed URL error:", signedError);
      return NextResponse.json(
        { error: "Could not generate download URL" },
        { status: 500 }
      );
    }

    // ── Proxy: fetch bytes server-side and stream to client ───────────────────
    const upstream = await fetch(signedUrlData.signedUrl);
    if (!upstream.ok) {
      console.error(`[download] Upstream fetch failed: ${upstream.status} ${upstream.statusText}`);
      return NextResponse.json(
        { error: "File fetch from storage failed" },
        { status: 502 }
      );
    }

    // Determine filename from storage_path (last segment) or fall back to kind+ext
    const pathSegments = artifact.storage_path.split("/");
    const rawFilename = pathSegments[pathSegments.length - 1] ?? "artifact";
    // Ensure correct extension
    const ext = KIND_EXT[artifact.kind] ?? rawFilename.split(".").pop() ?? "bin";
    const baseName = rawFilename.includes(".")
      ? rawFilename.replace(/\.[^.]+$/, "")
      : rawFilename;
    const filename = `${baseName}.${ext}`;

    const mimeType =
      artifact.mime_type ??
      KIND_MIME[artifact.kind] ??
      "application/octet-stream";

    const body = await upstream.arrayBuffer();

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(body.byteLength),
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (err) {
    console.error("[download] Artifact download error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
