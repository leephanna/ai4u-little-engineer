/**
 * POST /api/intake/upload
 *
 * Stores uploaded file metadata and base64 content for an intake session.
 * Called by UniversalInputComposer after files are selected.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

interface UploadBody {
  session_id: string;
  files: Array<{
    name: string;
    type: string;
    size: number;
    dataUrl: string;
  }>;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: UploadBody = await req.json();
    const { session_id, files } = body;

    if (!session_id || !files?.length) {
      return NextResponse.json({ error: "session_id and files are required" }, { status: 400 });
    }

    const serviceSupabase = createServiceClient();

    // Verify the session belongs to this user
    const { data: session } = await serviceSupabase
      .from("intake_sessions")
      .select("id")
      .eq("id", session_id)
      .eq("user_id", user.id)
      .single();

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Insert file records
    const records = files.map((f) => ({
      session_id,
      user_id: user.id,
      file_name: f.name,
      file_type: f.type,
      file_size_bytes: f.size,
      data_url: f.dataUrl,
      file_category: f.type.startsWith("image/") && f.type !== "image/svg+xml"
        ? "image"
        : f.type === "image/svg+xml"
        ? "svg"
        : "document",
    }));

    const { data: inserted, error } = await serviceSupabase
      .from("intake_uploaded_files")
      .insert(records)
      .select("id, file_name, file_type, file_category");

    if (error) {
      console.error("[/api/intake/upload] DB error:", error);
      return NextResponse.json({ error: "Failed to store files" }, { status: 500 });
    }

    return NextResponse.json({ uploaded: inserted });
  } catch (err) {
    console.error("[/api/intake/upload]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
