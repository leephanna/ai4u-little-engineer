/**
 * update-user-profile — Trigger.dev Task
 *
 * Analyzes a user's design_learning_records to build/update their
 * design memory profile in user_design_profiles. Captures:
 *   - preferred families
 *   - typical dimension ranges
 *   - common materials/tolerances
 *   - vocabulary patterns (how they describe parts)
 *
 * Triggered by: after each successful job completion (fire-and-forget).
 * Payload: { user_id: string }
 */

import { task, logger } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { z } from "zod";

const UpdateProfilePayload = z.object({
  user_id: z.string().uuid(),
});

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key);
}

export const updateUserProfile = task({
  id: "update-user-profile",
  maxDuration: 60,
  run: async (payload: unknown) => {
    const { user_id } = UpdateProfilePayload.parse(payload);
    const supabase = getSupabaseClient();
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    logger.log("Updating user design profile", { user_id });

    // ── Load user's learning records ──────────────────────────
    const { data: records } = await supabase
      .from("design_learning_records")
      .select("transcript, parsed_intent, final_spec, spec_corrections, quality_score, clarification_count, created_at")
      .eq("user_id", user_id)
      .eq("generation_status", "success")
      .order("created_at", { ascending: false })
      .limit(50);

    if (!records || records.length === 0) {
      logger.log("No learning records found for user", { user_id });
      return { user_id, updated: false, reason: "no_records" };
    }

    logger.log(`Found ${records.length} records for user`);

    // ── Compute basic stats ───────────────────────────────────
    const familyCounts: Record<string, number> = {};
    const allDimensions: Record<string, number[]> = {};
    const vocabularyPatterns: string[] = [];

    for (const record of records) {
      const spec = record.final_spec as Record<string, unknown> ?? {};
      const family = spec.family as string;
      if (family) {
        familyCounts[family] = (familyCounts[family] ?? 0) + 1;
      }
      const dims = spec.dimensions as Record<string, number> ?? {};
      for (const [key, val] of Object.entries(dims)) {
        if (typeof val === "number") {
          if (!allDimensions[key]) allDimensions[key] = [];
          allDimensions[key].push(val);
        }
      }
      if (record.transcript) {
        vocabularyPatterns.push(record.transcript.slice(0, 100));
      }
    }

    // Compute dimension ranges
    const dimensionRanges: Record<string, { min: number; max: number; avg: number }> = {};
    for (const [key, vals] of Object.entries(allDimensions)) {
      if (vals.length > 0) {
        dimensionRanges[key] = {
          min: Math.min(...vals),
          max: Math.max(...vals),
          avg: vals.reduce((a, b) => a + b, 0) / vals.length,
        };
      }
    }

    // Sort families by frequency
    const preferredFamilies = Object.entries(familyCounts)
      .sort(([, a], [, b]) => b - a)
      .map(([family, count]) => ({ family, count }));

    // ── Use LLM to extract vocabulary patterns ────────────────
    let vocabularySummary = "";
    if (vocabularyPatterns.length >= 5) {
      try {
        const vocabCompletion = await openai.chat.completions.create({
          model: "gpt-4.1-mini",
          messages: [
            {
              role: "user",
              content: `Analyze these ${vocabularyPatterns.length} user requests to a CAD design assistant and summarize in 2-3 sentences how this user typically describes parts (their vocabulary style, level of technical detail, units preference, etc.):

${vocabularyPatterns.slice(0, 20).map((t, i) => `${i + 1}. "${t}"`).join("\n")}`,
            },
          ],
          temperature: 0.3,
          max_tokens: 200,
        });
        vocabularySummary = vocabCompletion.choices[0]?.message?.content?.trim() ?? "";
      } catch {
        // Non-blocking
      }
    }

    // ── Upsert user_design_profiles ───────────────────────────
    const profileData = {
      user_id,
      preferred_families: preferredFamilies,
      dimension_ranges: dimensionRanges,
      vocabulary_summary: vocabularySummary,
      total_designs: records.length,
      avg_quality_score:
        records.reduce((sum, r) => sum + ((r.quality_score as number) ?? 0), 0) / records.length,
      avg_clarification_count:
        records.reduce((sum, r) => sum + ((r.clarification_count as number) ?? 0), 0) / records.length,
      last_active_at: records[0]?.created_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error: upsertErr } = await supabase
      .from("user_design_profiles")
      .upsert(profileData, { onConflict: "user_id" });

    if (upsertErr) {
      logger.warn("Failed to upsert user design profile", { error: upsertErr.message });
    } else {
      logger.log("User design profile updated", {
        user_id,
        total_designs: records.length,
        preferred_families: preferredFamilies.slice(0, 3),
      });
    }

    return {
      user_id,
      updated: !upsertErr,
      total_designs: records.length,
      preferred_families: preferredFamilies.slice(0, 5),
      dimension_ranges_count: Object.keys(dimensionRanges).length,
    };
  },
});
