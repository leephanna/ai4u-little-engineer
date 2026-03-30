/**
 * analyze-print-feedback — Trigger.dev Task
 *
 * Multimodal analysis of a user's print photo. Uses GPT-4o vision to:
 *   1. Assess print quality (layer adhesion, stringing, warping, fit)
 *   2. Detect dimensional issues (over/under extrusion, XY shrinkage)
 *   3. Update the user's printer_profile with a moving-average XY compensation
 *   4. Write analysis_result back to print_feedback row
 *   5. Propose a tolerance_insight if confidence is high enough
 *
 * Triggered by: POST /api/feedback/upload
 * Payload: { feedback_id, job_id, user_id, image_path, image_url }
 *
 * Phase 5: Print feedback loop
 */

import { task, logger } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { z } from "zod";

const Payload = z.object({
  feedback_id: z.string().uuid(),
  job_id: z.string().uuid(),
  user_id: z.string().uuid(),
  image_path: z.string(),
  image_url: z.string().nullable(),
});

function getSupabase() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key);
}

// ── Vision analysis schema ─────────────────────────────────────────────────

const PrintAnalysis = z.object({
  overall_quality: z.enum(["excellent", "good", "acceptable", "poor", "failed"]),
  layer_adhesion: z.enum(["good", "delamination", "stringing", "unknown"]),
  dimensional_accuracy: z.enum(["accurate", "slightly_off", "significantly_off", "unknown"]),
  xy_shrinkage_estimate_pct: z.number().min(-5).max(5).nullable(),
  warping: z.boolean(),
  surface_quality: z.enum(["smooth", "rough", "blobbing", "unknown"]),
  fit_assessment: z.enum(["perfect_fit", "too_tight", "too_loose", "not_tested", "unknown"]),
  recommended_xy_compensation_mm: z.number().min(-1.0).max(1.0).nullable(),
  confidence: z.number().min(0).max(1),
  notes: z.string().max(500),
});

type PrintAnalysisType = z.infer<typeof PrintAnalysis>;

// ── Moving average helper ──────────────────────────────────────────────────

function movingAverage(current: number, newValue: number, alpha = 0.3): number {
  return current * (1 - alpha) + newValue * alpha;
}

export const analyzePrintFeedback = task({
  id: "analyze-print-feedback",
  maxDuration: 120,

  run: async (payload: unknown) => {
    const { feedback_id, job_id, user_id, image_url } = Payload.parse(payload);
    const supabase = getSupabase();
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    logger.log("Analyzing print feedback", { feedback_id, job_id, user_id });

    // ── Load feedback row ──────────────────────────────────────
    const { data: feedback } = await supabase
      .from("print_feedback")
      .select("overall_rating, fit_result, material, notes, printed, job_id")
      .eq("id", feedback_id)
      .single();

    if (!feedback) {
      logger.error("Feedback row not found", { feedback_id });
      return { analyzed: false, reason: "feedback_not_found" };
    }

    // ── Load job for context ───────────────────────────────────
    const { data: job } = await supabase
      .from("jobs")
      .select("selected_family, final_spec")
      .eq("id", job_id)
      .single();

    // ── Build vision prompt ────────────────────────────────────
    const contextText = [
      `Part family: ${job?.selected_family ?? "unknown"}`,
      `User rating: ${feedback.overall_rating ?? "not provided"}/5`,
      `Fit result: ${feedback.fit_result ?? "not provided"}`,
      `Material: ${feedback.material ?? "unknown"}`,
      `User notes: ${feedback.notes ?? "none"}`,
      `Print attempted: ${feedback.printed === false ? "No" : "Yes"}`,
    ].join("\n");

    let analysis: PrintAnalysisType;

    if (image_url) {
      // ── Vision analysis ──────────────────────────────────────
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 800,
        messages: [
          {
            role: "system",
            content: `You are an expert FDM 3D printing quality analyst. Analyze the provided print photo and return a JSON object matching the schema exactly. Be precise about dimensional accuracy — this data feeds a printer calibration system.`,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyze this 3D print photo. Context:\n${contextText}\n\nReturn ONLY a JSON object with these exact fields:\n{\n  "overall_quality": "excellent|good|acceptable|poor|failed",\n  "layer_adhesion": "good|delamination|stringing|unknown",\n  "dimensional_accuracy": "accurate|slightly_off|significantly_off|unknown",\n  "xy_shrinkage_estimate_pct": number or null (-5 to +5),\n  "warping": boolean,\n  "surface_quality": "smooth|rough|blobbing|unknown",\n  "fit_assessment": "perfect_fit|too_tight|too_loose|not_tested|unknown",\n  "recommended_xy_compensation_mm": number or null (-1.0 to +1.0),\n  "confidence": number (0-1),\n  "notes": "brief technical note"\n}`,
              },
              {
                type: "image_url",
                image_url: { url: image_url, detail: "high" },
              },
            ],
          },
        ],
      });

      const raw = response.choices[0]?.message?.content ?? "{}";
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
      analysis = PrintAnalysis.parse(parsed);
    } else {
      // ── Text-only analysis (no image) ────────────────────────
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 400,
        messages: [
          {
            role: "system",
            content: "You are an expert FDM 3D printing analyst. Based on user-provided text feedback only, return a JSON analysis.",
          },
          {
            role: "user",
            content: `Analyze this print feedback (no image available):\n${contextText}\n\nReturn ONLY a JSON object with the same schema. Set confidence to 0.4 or lower since no image was provided.`,
          },
        ],
      });

      const raw = response.choices[0]?.message?.content ?? "{}";
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
      analysis = PrintAnalysis.parse({
        overall_quality: "unknown",
        layer_adhesion: "unknown",
        dimensional_accuracy: "unknown",
        xy_shrinkage_estimate_pct: null,
        warping: false,
        surface_quality: "unknown",
        fit_assessment: "unknown",
        recommended_xy_compensation_mm: null,
        confidence: 0.3,
        notes: "No image provided — text-only analysis",
        ...parsed,
      });
    }

    logger.log("Analysis complete", { analysis });

    // ── Write analysis back to print_feedback ─────────────────
    await supabase
      .from("print_feedback")
      .update({
        analysis_result: analysis,
        review_status: "pending",
      })
      .eq("id", feedback_id);

    // ── Update printer profile (moving average XY compensation) ─
    if (
      analysis.recommended_xy_compensation_mm !== null &&
      analysis.confidence >= 0.6
    ) {
      const compensation = analysis.recommended_xy_compensation_mm;

      // Load existing printer profile for this user
      const { data: existingProfile } = await supabase
        .from("printer_profiles")
        .select("id, xy_compensation_mm, calibration_count")
        .eq("user_id", user_id)
        .order("is_default", { ascending: false })
        .limit(1)
        .single();

      if (existingProfile) {
        const currentComp = (existingProfile.xy_compensation_mm as number) ?? 0;
        const calibCount = (existingProfile.calibration_count as number) ?? 0;
        const newComp = movingAverage(currentComp, compensation, 0.3);

        await supabase
          .from("printer_profiles")
          .update({
            xy_compensation_mm: Math.round(newComp * 1000) / 1000,
            calibration_count: calibCount + 1,
            last_calibrated_at: new Date().toISOString(),
          })
          .eq("id", existingProfile.id as string);

        logger.log("Updated printer profile XY compensation", {
          user_id,
          old: currentComp,
          new: newComp,
          compensation,
        });
      }
    }

    // ── Propose tolerance insight if high confidence ───────────
    if (
      analysis.confidence >= 0.75 &&
      analysis.recommended_xy_compensation_mm !== null &&
      Math.abs(analysis.recommended_xy_compensation_mm) >= 0.05 &&
      job?.selected_family
    ) {
      const { data: existing } = await supabase
        .from("tolerance_insights")
        .select("id")
        .eq("family", job.selected_family)
        .eq("dimension_name", "hole_diameter")
        .eq("status", "proposed")
        .limit(1)
        .single();

      if (!existing) {
        await supabase.from("tolerance_insights").insert({
          family: job.selected_family,
          dimension_name: "hole_diameter",
          suggested_adjustment: analysis.recommended_xy_compensation_mm * 2,
          adjustment_unit: "mm",
          confidence_score: analysis.confidence,
          evidence_count: 1,
          condition_context: {
            material: feedback.material,
            fit_result: feedback.fit_result,
            source: "print_feedback_analysis",
          },
          status: "proposed",
        });

        logger.log("Proposed tolerance insight", {
          family: job.selected_family,
          adjustment: analysis.recommended_xy_compensation_mm * 2,
        });
      }
    }

    return {
      analyzed: true,
      feedback_id,
      overall_quality: analysis.overall_quality,
      confidence: analysis.confidence,
      xy_compensation_updated: analysis.recommended_xy_compensation_mm !== null && analysis.confidence >= 0.6,
    };
  },
});
