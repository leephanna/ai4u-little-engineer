/**
 * POST /api/projects/score
 *
 * Triggers a score recalculation for a project.
 * Called automatically when:
 *   - A print feedback is submitted (from /api/feedback/upload)
 *   - A project is reused (usage_count incremented)
 *   - Admin manually triggers recalculation
 *
 * Request body: { project_id: string }
 * Auth: Authenticated user (owns the project) OR admin
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getAuthUser } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const serviceSupabase = createServiceClient();

        const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { project_id } = body as { project_id?: string };

    if (!project_id) {
      return NextResponse.json({ error: "Missing project_id" }, { status: 400 });
    }

    // Verify project exists and user has access (owns it or is admin)
    const { data: project, error: projectError } = await serviceSupabase
      .from("projects")
      .select("id, creator_id, created_by")
      .eq("id", project_id)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const isOwner =
      project.creator_id === user.id || project.created_by === user.id;

    // Check if admin
    const { data: profile } = await serviceSupabase
      .from("profiles")
      .select("role")
      .eq("clerk_user_id", user.id)
      .single();

    const isAdmin = profile?.role === "admin" || profile?.role === "owner";

    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Trigger the recalculation task
    if (process.env.TRIGGER_SECRET_KEY) {
      try {
        const { tasks } = await import("@trigger.dev/sdk/v3");
        const handle = await tasks.trigger("recalculate-success-score", {
          project_id,
        });
        return NextResponse.json({
          ok: true,
          trigger_run_id: handle.id,
          message: "Score recalculation queued",
        });
      } catch (err) {
        console.error("Trigger.dev dispatch failed:", err);
        // Fall through to inline calculation
      }
    }

    // Inline fallback: calculate score directly without Trigger.dev
    const { data: projectFull } = await serviceSupabase
      .from("projects")
      .select("id, usage_count, job_id")
      .eq("id", project_id)
      .single();

    const { data: feedback } = await serviceSupabase
      .from("print_feedback")
      .select("overall_rating, fit_result, material")
      .eq("job_id", projectFull?.job_id ?? "00000000-0000-0000-0000-000000000000");

    const allFeedback = feedback ?? [];
    const totalPrints = allFeedback.length;
    const successfulPrints = allFeedback.filter(
      (f) => f.fit_result === "perfect" || f.fit_result === "good"
    ).length;
    const failedPrints = allFeedback.filter(
      (f) => f.fit_result === "poor" || f.fit_result === "failed"
    ).length;
    const ratings = allFeedback.filter((f) => f.overall_rating > 0);
    const avgRating =
      ratings.length > 0
        ? ratings.reduce((s, f) => s + f.overall_rating, 0) / ratings.length
        : null;
    const usageCount = projectFull?.usage_count ?? 0;

    const baseScore = totalPrints > 0 ? (successfulPrints / totalPrints) * 60 : 30;
    const ratingScore = avgRating !== null ? (avgRating / 5) * 25 : 12.5;
    const reuseScore = Math.min(usageCount / 10, 1) * 15;
    const successScore = Math.round((baseScore + ratingScore + reuseScore) * 100) / 100;
    const successRate =
      totalPrints > 0
        ? Math.round((successfulPrints / totalPrints) * 10000) / 100
        : null;

    await serviceSupabase
      .from("projects")
      .update({
        success_score: successScore,
        success_rate: successRate,
        successful_prints: successfulPrints,
        failed_prints: failedPrints,
        score_updated_at: new Date().toISOString(),
      })
      .eq("id", project_id);

    return NextResponse.json({
      ok: true,
      success_score: successScore,
      success_rate: successRate,
      message: "Score recalculated inline",
    });
  } catch (err) {
    console.error("Score recalculation error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
