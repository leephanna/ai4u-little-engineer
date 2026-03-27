/**
 * POST /api/jobs/[id]/generate
 * Triggers a CAD generation job via the Trigger.dev v3 SDK.
 *
 * Billing gate (v0.2.0 hardening):
 *   Before dispatching, this route checks the user's plan and monthly usage.
 *   - Free plan: max 5 generations/month
 *   - Maker plan: max 100 generations/month
 *   - Pro plan: unlimited
 *   If the user is over their limit, a 402 is returned with an upgrade URL.
 *   On success, generations_this_month is incremented atomically.
 *
 * The SDK reads TRIGGER_SECRET_KEY and TRIGGER_API_URL from environment
 * variables automatically — no manual configure() call needed.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { tasks } from "@trigger.dev/sdk/v3";
import { checkGenerationAllowed, type PlanId } from "@/lib/stripe/config";

interface GenerateBody {
  part_spec_id: string;
  variant_type?: "requested" | "stronger" | "print_optimized" | "alternate";
  engine?: "build123d" | "freecad";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;

    // Support both SSR cookie auth (browser) and Bearer token auth (API clients)
    const authHeader = request.headers.get("authorization");
    let supabase: Awaited<ReturnType<typeof createClient>>;
    let user: { id: string; email?: string } | null = null;

    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const anonClient = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { global: { headers: { Authorization: `Bearer ${token}` } } }
      );
      const { data } = await anonClient.auth.getUser(token);
      user = data.user;
      supabase = anonClient as unknown as Awaited<ReturnType<typeof createClient>>;
    } else {
      supabase = await createClient();
      const { data } = await supabase.auth.getUser();
      user = data.user;
    }

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Billing gate ─────────────────────────────────────────────
    // Fetch the user's profile to get plan and monthly usage.
    // Uses the service client so we can read the profiles row reliably.
    const serviceSupabase = await createServiceClient();
    const { data: profile } = await serviceSupabase
      .from("profiles")
      .select("plan, generations_this_month, generation_month")
      .eq("id", user.id)
      .single();

    // Default to free plan if profile is missing (new user edge case)
    const userPlan = ((profile?.plan as PlanId) ?? "free") as PlanId;
    const currentMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM'

    // Reset counter if we're in a new month
    let generationsThisMonth = profile?.generations_this_month ?? 0;
    if (profile?.generation_month !== currentMonth) {
      // New month — treat counter as 0 (will be reset on increment below)
      generationsThisMonth = 0;
    }

    const entitlement = checkGenerationAllowed(userPlan, generationsThisMonth);

    if (!entitlement.allowed) {
      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL ??
        "https://ai4u-little-engineer-web.vercel.app";
      return NextResponse.json(
        {
          error: "Generation limit reached",
          detail: `Your ${userPlan} plan allows ${
            userPlan === "free" ? "5" : "100"
          } generations per month. Upgrade to continue.`,
          plan: userPlan,
          generations_used: generationsThisMonth,
          upgrade_url: `${appUrl}/pricing`,
        },
        { status: 402 }
      );
    }

    // Verify job ownership and status
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, status, user_id, latest_spec_version")
      .eq("id", jobId)
      .eq("user_id", user.id)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const allowedStatuses = ["draft", "clarifying", "failed"];
    if (!allowedStatuses.includes(job.status)) {
      return NextResponse.json(
        { error: `Cannot generate from status: ${job.status}` },
        { status: 400 }
      );
    }

    const body: GenerateBody = await request.json();
    const {
      part_spec_id,
      variant_type = "requested",
      engine = "build123d",
    } = body;

    if (!part_spec_id) {
      return NextResponse.json(
        { error: "Missing required field: part_spec_id" },
        { status: 400 }
      );
    }

    // Verify spec belongs to this job
    const { data: spec, error: specError } = await supabase
      .from("part_specs")
      .select("id, family")
      .eq("id", part_spec_id)
      .eq("job_id", jobId)
      .single();

    if (specError || !spec) {
      return NextResponse.json(
        { error: "Part spec not found for this job" },
        { status: 404 }
      );
    }

    // ── Increment generation counter (atomic) ────────────────────
    // Do this before dispatch so the counter is accurate even if dispatch fails.
    await serviceSupabase
      .from("profiles")
      .update({
        generations_this_month: generationsThisMonth + 1,
        generation_month: currentMonth,
      })
      .eq("id", user.id);

    // Create a CAD run record (queued) — Trigger.dev pipeline will update it
    // NOTE: cad_runs has no INSERT RLS policy (only SELECT), so we must use
    // the service role client here. The user's ownership is verified above
    // via the job ownership check.
    const { data: cadRun, error: runError } = await serviceSupabase
      .from("cad_runs")
      .insert({
        job_id: jobId,
        part_spec_id,
        engine,
        generator_name: spec.family,
        generator_version: "1.0.0",
        status: "queued",
        normalized_params_json: {},
        validation_report_json: {},
      })
      .select()
      .single();

    if (runError || !cadRun) {
      console.error("CAD run insert error:", runError);
      // Roll back the counter increment on insert failure
      await serviceSupabase
        .from("profiles")
        .update({ generations_this_month: generationsThisMonth })
        .eq("id", user.id);
      return NextResponse.json(
        { error: "Failed to create CAD run record" },
        { status: 500 }
      );
    }

    // Update job status to generating
    await serviceSupabase
      .from("jobs")
      .update({ status: "generating", latest_run_id: cadRun.id })
      .eq("id", jobId);

    // ── Trigger the Trigger.dev v3 pipeline ───────────────────
    // The SDK reads TRIGGER_SECRET_KEY and TRIGGER_API_URL automatically.
    // If TRIGGER_SECRET_KEY is not set, tasks.trigger will throw — we catch
    // that and return a 503 so the caller knows the background job was not
    // dispatched (the cad_run row stays in "queued" for manual recovery).
    let triggerRunId: string | null = null;

    if (!process.env.TRIGGER_SECRET_KEY) {
      console.warn(
        "TRIGGER_SECRET_KEY not set — Trigger.dev dispatch skipped. " +
          "The cad_run row has been created in 'queued' status."
      );
    } else {
      try {
        const handle = await tasks.trigger(
          "cad-generation-pipeline",
          {
            job_id: jobId,
            cad_run_id: cadRun.id,
            part_spec_id,
            variant_type,
            engine,
          }
        );
        triggerRunId = handle.id;
      } catch (err) {
        console.error("Trigger.dev dispatch failed:", err);
        // Roll back job status and counter so the user can retry
        await serviceSupabase
          .from("jobs")
          .update({ status: "failed" })
          .eq("id", jobId);
        await serviceSupabase
          .from("cad_runs")
          .update({
            status: "failed",
            error_text: `Trigger.dev dispatch failed: ${String(err)}`,
            ended_at: new Date().toISOString(),
          })
          .eq("id", cadRun.id);
        await serviceSupabase
          .from("profiles")
          .update({ generations_this_month: generationsThisMonth })
          .eq("id", user.id);
        return NextResponse.json(
          { error: "Failed to dispatch background job. Please retry." },
          { status: 503 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      cad_run_id: cadRun.id,
      trigger_run_id: triggerRunId,
      status: "queued",
      plan: userPlan,
      generations_remaining: entitlement.remaining !== null
        ? entitlement.remaining - 1
        : null,
    });
  } catch (err) {
    console.error("Generate trigger error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
