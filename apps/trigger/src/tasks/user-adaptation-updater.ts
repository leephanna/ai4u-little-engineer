/**
 * user-adaptation-updater.ts
 * ─────────────────────────────────────────────────────────────
 * Trigger.dev task: analyse a user's design history and update
 * their user_design_profiles record with adaptive behaviour
 * signals.
 *
 * Upgraded from Phase 1 (passive record) to Phase 2 (active
 * adaptation):
 *   • Infers experience level from vocabulary and complexity
 *   • Detects preferred materials from notes/transcripts
 *   • Adjusts clarification verbosity based on session patterns
 *   • Updates preferred_tolerance_style from print feedback
 * ─────────────────────────────────────────────────────────────
 */

import { task, logger } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { callAI, HARMONIA_MODELS } from "../lib/ai-providers";

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key);
}

const Payload = z.object({
  user_id: z.string().uuid(),
  /** Number of recent sessions to analyse */
  lookback_sessions: z.number().int().min(1).max(50).default(10),
});

export const userAdaptationUpdater = task({
  id: "user-adaptation-updater",
  maxDuration: 120,
  run: async (payload: unknown) => {
    const { user_id, lookback_sessions } = Payload.parse(payload);
    const supabase = getSupabaseClient();

    logger.log("Running user adaptation update", { user_id });

    // ── Load recent jobs for this user ────────────────────────
    const { data: jobs, error: jobsErr } = await supabase
      .from("jobs")
      .select("id, selected_family, status, created_at")
      .eq("user_id", user_id)
      .order("created_at", { ascending: false })
      .limit(lookback_sessions);

    if (jobsErr) throw new Error(`Failed to load jobs: ${jobsErr.message}`);
    if (!jobs || jobs.length === 0) {
      logger.log("No jobs found for user", { user_id });
      return { user_id, updated: false, reason: "no_jobs" };
    }

    // ── Load design learning records ──────────────────────────
    const jobIds = jobs.map((j) => j.id as string);
    const { data: learningRecords } = await supabase
      .from("design_learning_records")
      .select("*")
      .in("job_id", jobIds)
      .order("created_at", { ascending: false });

    // ── Load print feedback ───────────────────────────────────
    const { data: feedback } = await supabase
      .from("print_feedback")
      .select("fit_rating, print_quality, notes")
      .in("job_id", jobIds);

    // ── Load existing profile ─────────────────────────────────
    const { data: existingProfile } = await supabase
      .from("user_design_profiles")
      .select("*")
      .eq("user_id", user_id)
      .single();

    // ── Use OpenAI to analyse patterns ────────────────────────
    const analysisPrompt = `You are analysing a user's design history to build an adaptive profile for an AI CAD assistant.

USER HISTORY:
- Total jobs: ${jobs.length}
- Families used: ${[...new Set(jobs.map((j) => j.selected_family as string).filter(Boolean))].join(", ")}
- Successful jobs: ${jobs.filter((j) => j.status === "completed").length}

LEARNING RECORDS (transcripts and intents):
${JSON.stringify((learningRecords ?? []).slice(0, 20), null, 2)}

PRINT FEEDBACK:
${JSON.stringify((feedback ?? []).slice(0, 10), null, 2)}

CURRENT PROFILE:
${JSON.stringify(existingProfile ?? {}, null, 2)}

Based on this data, infer:
1. experience_level: "beginner" (uses basic terms, needs guidance) | "intermediate" | "expert" (uses technical terms, gives precise dims)
2. preferred_materials: list of materials mentioned in notes/feedback
3. preferred_tolerance_style: "tight" (fit issues, requests precision) | "standard" | "loose" (functional parts, not precision)
4. clarification_verbosity: "minimal" (expert, gets straight to dims) | "standard" | "verbose" (needs more guidance)
5. top_families: most used part families

Respond with JSON:
{
  "inferred_experience_level": "beginner|intermediate|expert",
  "preferred_materials": ["PLA", "PETG"],
  "preferred_tolerance_style": "tight|standard|loose",
  "clarification_verbosity": "minimal|standard|verbose",
  "top_families": ["spacer", "bracket"],
  "adaptation_notes": "Brief explanation of inferences"
}`;

    const analysisResp = await callAI(
      HARMONIA_MODELS.proposer,
      [{ role: "user", content: analysisPrompt }],
      { temperature: 0.1, max_tokens: 512, json_mode: true }
    );

    const analysis = analysisResp.parsed ?? {};
    logger.log("User adaptation analysis complete", { analysis });

    // ── Upsert user_design_profiles ───────────────────────────
    const profileUpdate = {
      user_id,
      inferred_experience_level: analysis.inferred_experience_level ?? "beginner",
      preferred_materials: analysis.preferred_materials ?? [],
      preferred_tolerance_style: analysis.preferred_tolerance_style ?? "standard",
      clarification_verbosity: analysis.clarification_verbosity ?? "standard",
      top_families: analysis.top_families ?? [],
      session_count: jobs.length,
      total_generations: jobs.filter((j) => j.status === "completed").length,
      last_active_at: new Date().toISOString(),
      adaptation_notes: analysis.adaptation_notes ?? "",
      updated_at: new Date().toISOString(),
    };

    const { error: upsertErr } = await supabase
      .from("user_design_profiles")
      .upsert(profileUpdate, { onConflict: "user_id" });

    if (upsertErr) {
      logger.error("Failed to upsert user profile", { error: upsertErr.message });
      throw new Error(`Failed to upsert user profile: ${upsertErr.message}`);
    }

    logger.log("User profile updated", { user_id, experience: profileUpdate.inferred_experience_level });

    return {
      user_id,
      updated: true,
      inferred_experience_level: profileUpdate.inferred_experience_level,
      preferred_tolerance_style: profileUpdate.preferred_tolerance_style,
      clarification_verbosity: profileUpdate.clarification_verbosity,
      top_families: profileUpdate.top_families,
    };
  },
});
