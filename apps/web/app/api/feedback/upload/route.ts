/**
 * POST /api/feedback/upload
 *
 * Accepts a multipart form upload of a print photo, stores it in
 * Supabase Storage (bucket: print-feedback), updates the print_feedback
 * row with the image path, and triggers the analyze-print-feedback task.
 *
 * Request body (multipart/form-data):
 *   - image: File (jpg/png/webp, max 10MB)
 *   - feedback_id: string (UUID of the print_feedback row)
 *   - job_id: string (UUID of the job)
 *
 * Phase 5: Print feedback loop
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { tasks } from "@trigger.dev/sdk/v3";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const BUCKET = "print-feedback";

export async function POST(req: NextRequest) {
  // Auth check
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const imageFile = formData.get("image") as File | null;
  const feedbackId = formData.get("feedback_id") as string | null;
  const jobId = formData.get("job_id") as string | null;

  if (!imageFile || !feedbackId || !jobId) {
    return NextResponse.json(
      { error: "Missing required fields: image, feedback_id, job_id" },
      { status: 400 }
    );
  }

  // Validate file
  if (imageFile.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "Image too large (max 10MB)" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(imageFile.type)) {
    return NextResponse.json(
      { error: "Invalid file type. Allowed: jpg, png, webp" },
      { status: 400 }
    );
  }

  // Verify the feedback row belongs to this user
  const { data: feedbackRow } = await supabase
    .from("print_feedback")
    .select("id, user_id, job_id")
    .eq("id", feedbackId)
    .eq("user_id", user.id)
    .single();

  if (!feedbackRow) {
    return NextResponse.json({ error: "Feedback record not found" }, { status: 404 });
  }

  // Upload to Supabase Storage
  const serviceClient = createServiceClient();
  const ext = imageFile.type === "image/png" ? "png" : imageFile.type === "image/webp" ? "webp" : "jpg";
  const storagePath = `${user.id}/${feedbackId}.${ext}`;

  const arrayBuffer = await imageFile.arrayBuffer();
  const { error: uploadError } = await serviceClient.storage
    .from(BUCKET)
    .upload(storagePath, arrayBuffer, {
      contentType: imageFile.type,
      upsert: true,
    });

  if (uploadError) {
    console.error("Storage upload error:", uploadError.message);
    return NextResponse.json({ error: "Failed to upload image" }, { status: 500 });
  }

  // Get public URL
  const { data: urlData } = serviceClient.storage
    .from(BUCKET)
    .getPublicUrl(storagePath);
  const publicUrl = urlData?.publicUrl ?? null;

  // Update print_feedback row with image path
  const { error: updateError } = await serviceClient
    .from("print_feedback")
    .update({
      image_path: storagePath,
      image_url: publicUrl,
    })
    .eq("id", feedbackId);

  if (updateError) {
    console.error("Failed to update feedback row:", updateError.message);
    // Non-fatal — image is uploaded, just metadata update failed
  }

  // Trigger multimodal analysis (fire-and-forget)
  try {
    await tasks.trigger("analyze-print-feedback", {
      feedback_id: feedbackId,
      job_id: jobId,
      user_id: user.id,
      image_path: storagePath,
      image_url: publicUrl,
    });
  } catch (err) {
    console.warn("Failed to trigger analyze-print-feedback:", err);
    // Non-fatal — analysis can be retried manually
  }

  return NextResponse.json({
    uploaded: true,
    image_path: storagePath,
    image_url: publicUrl,
    analysis_triggered: true,
  });
}
