/**
 * GET /api/artifacts/[id]/download
 * Generate a signed download URL for an artifact from Supabase Storage.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: artifactId } = await params;
    const supabase = await createClient();

        const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch artifact and verify ownership through job
    const { data: artifact, error } = await supabase
      .from("artifacts")
      .select("id, storage_path, mime_type, kind, jobs!inner(user_id)")
      .eq("id", artifactId)
      .single();

    if (error || !artifact) {
      return NextResponse.json({ error: "Artifact not found" }, { status: 404 });
    }

    // Verify ownership
    const job = (artifact as any).jobs;
    if (job?.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Guard: storage_path must be present
    if (!artifact.storage_path) {
      return NextResponse.json(
        { error: "Artifact file not yet available — generation may still be in progress" },
        { status: 404 }
      );
    }

    // Generate signed URL (valid for 60 seconds)
    const serviceClient = await createServiceClient();
    const { data: signedUrl, error: signedError } = await serviceClient.storage
      .from("cad-artifacts")
      .createSignedUrl(artifact.storage_path, 60);

    if (signedError || !signedUrl) {
      console.error("Signed URL error:", signedError);
      return NextResponse.json(
        { error: "Could not generate download URL" },
        { status: 500 }
      );
    }

    // Redirect to signed URL
    return NextResponse.redirect(signedUrl.signedUrl);
  } catch (err) {
    console.error("Artifact download error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
