/**
 * POST /api/mobile/print-feedback
 *
 * Records user feedback after printing a CAD artifact.
 * Called by the mobile app after the user downloads and prints a part.
 *
 * Body:
 *   artifact_id: string (UUID)
 *   job_id: string (UUID)
 *   printed_successfully: boolean
 *   rating: 1-5 integer
 *   fit_quality: "too_tight" | "perfect" | "too_loose" | null
 *   surface_quality: "excellent" | "good" | "acceptable" | "poor" | null
 *   notes: string | null
 *   printer_type: string | null  (e.g. "FDM", "SLA", "SLS")
 *   material: string | null       (e.g. "PLA", "PETG", "ABS")
 *   layer_height_mm: number | null
 *
 * Response: { id: string, recorded: true }
 *
 * Side effects:
 *   - Writes to print_feedback table
 *   - Updates design_learning_records.print_feedback_score
 *   - Writes decision_ledger entry
 *   - Triggers update-user-profile task (fire-and-forget)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { tasks } from "@trigger.dev/sdk/v3";
import { z } from "zod";

const PrintFeedbackBody = z.object({
  artifact_id: z.string().uuid(),
  job_id: z.string().uuid(),
  printed_successfully: z.boolean(),
  rating: z.number().int().min(1).max(5),
  fit_quality: z.enum(["too_tight", "perfect", "too_loose"]).nullable().optional(),
  surface_quality: z.enum(["excellent", "good", "acceptable", "poor"]).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  printer_type: z.string().max(50).nullable().optional(),
  material: z.string().max(50).nullable().optional(),
  layer_height_mm: z.number().positive().nullable().optional(),
});

export async function POST(req: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────
    const supabase = await createServiceClient();
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.slice(7);

    // Verify the JWT and get the user
    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data: { user }, error: authErr } = await anonClient.auth.getUser(token);
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Parse body ────────────────────────────────────────────
    const body = await req.json();
    const parsed = PrintFeedbackBody.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const data = parsed.data;

    // ── Verify job ownership ──────────────────────────────────
    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .select("id, user_id, status")
      .eq("id", data.job_id)
      .single();

    if (jobErr || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    if (job.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // ── Insert print_feedback row ─────────────────────────────
    const { data: feedbackRow, error: insertErr } = await supabase
      .from("print_feedback")
      .insert({
        user_id: user.id,
        job_id: data.job_id,
        artifact_id: data.artifact_id,
        printed_successfully: data.printed_successfully,
        rating: data.rating,
        fit_quality: data.fit_quality ?? null,
        surface_quality: data.surface_quality ?? null,
        notes: data.notes ?? null,
        printer_type: data.printer_type ?? null,
        material: data.material ?? null,
        layer_height_mm: data.layer_height_mm ?? null,
      })
      .select("id")
      .single();

    if (insertErr || !feedbackRow) {
      console.error("Failed to insert print_feedback:", insertErr?.message);
      return NextResponse.json({ error: "Failed to record feedback" }, { status: 500 });
    }

    // ── Update design_learning_records.print_feedback_score ───
    // Normalize rating (1-5) to 0-1 score
    const feedbackScore = (data.rating - 1) / 4;
    void supabase
      .from("design_learning_records")
      .update({ print_feedback_score: feedbackScore })
      .eq("job_id", data.job_id)
      .then(({ error }) => {
        if (error) console.warn("Failed to update learning record feedback score:", error.message);
      });

    // ── Write decision_ledger entry ───────────────────────────
    void supabase
      .from("decision_ledger")
      .insert({
        job_id: data.job_id,
        step: "print_feedback_received",
        decision_reason: `User rated print ${data.rating}/5 (${data.printed_successfully ? "success" : "failed"})${data.fit_quality ? `, fit=${data.fit_quality}` : ""}`,
        inputs: {
          artifact_id: data.artifact_id,
          printer_type: data.printer_type,
          material: data.material,
        },
        outputs: {
          rating: data.rating,
          printed_successfully: data.printed_successfully,
          fit_quality: data.fit_quality,
          surface_quality: data.surface_quality,
        },
      })
      .then(({ error }) => {
        if (error) console.warn("Failed to write decision ledger:", error.message);
      });

    // ── Trigger update-user-profile (fire-and-forget) ─────────
    void tasks
      .trigger("update-user-profile", { user_id: user.id })
      .catch((err) => console.warn("Failed to trigger update-user-profile:", err));

    return NextResponse.json({
      id: feedbackRow.id,
      recorded: true,
    });
  } catch (err) {
    console.error("print-feedback error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
