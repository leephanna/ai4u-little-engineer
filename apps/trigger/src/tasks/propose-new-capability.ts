/**
 * propose-new-capability — Trigger.dev Task
 *
 * Analyzes design_learning_records for unrecognized part families
 * (intent=unknown, family=null) and clusters them to identify
 * candidate new capabilities. Writes proposals to capability_registry
 * with status='proposed' for human review.
 *
 * Triggered by: scheduled (weekly) or manually.
 * Payload: { lookback_days?: number, min_request_count?: number }
 */

import { task, logger } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { z } from "zod";

const ProposeCapabilityPayload = z.object({
  lookback_days: z.number().default(7),
  min_request_count: z.number().default(3),
});

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key);
}

export const proposeNewCapability = task({
  id: "propose-new-capability",
  maxDuration: 120,
  run: async (payload: unknown) => {
    const { lookback_days, min_request_count } = ProposeCapabilityPayload.parse(payload ?? {});
    const supabase = getSupabaseClient();
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const since = new Date(Date.now() - lookback_days * 24 * 3600 * 1000).toISOString();

    logger.log("Analyzing unrecognized requests", { lookback_days, since });

    // ── Load unrecognized requests ────────────────────────────
    const { data: unknownRecords } = await supabase
      .from("design_learning_records")
      .select("transcript, parsed_intent, final_spec, user_id, created_at")
      .eq("parsed_intent", "unknown")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(100);

    if (!unknownRecords || unknownRecords.length < min_request_count) {
      logger.log("Not enough unrecognized requests to propose capabilities", {
        count: unknownRecords?.length ?? 0,
        min_required: min_request_count,
      });
      return { proposals: [], unrecognized_count: unknownRecords?.length ?? 0 };
    }

    logger.log(`Found ${unknownRecords.length} unrecognized requests`);

    // ── Load existing capability families to avoid duplicates ─
    const { data: existingCaps } = await supabase
      .from("capability_registry")
      .select("family, status");

    const existingFamilies = new Set((existingCaps ?? []).map((c) => c.family));

    // ── Use LLM to cluster and propose new capabilities ───────
    const transcripts = unknownRecords
      .map((r, i) => `${i + 1}. "${r.transcript}"`)
      .join("\n");

    const analysisPrompt = `You are analyzing user requests to an AI CAD design assistant that currently supports these part families:
${[...existingFamilies].join(", ")}

The following ${unknownRecords.length} user requests were NOT recognized by the system:
${transcripts}

Analyze these requests and identify:
1. Distinct new part families that appear multiple times (minimum ${min_request_count} requests)
2. For each proposed family, define the required dimensions

Respond with JSON:
{
  "proposals": [
    {
      "family": "snake_case_family_name",
      "display_name": "Human Readable Name",
      "description": "Brief description of this part type",
      "required_dimensions": ["dim1", "dim2"],
      "optional_dimensions": ["dim3"],
      "request_count": 5,
      "example_transcripts": ["example 1", "example 2"],
      "complexity": "low|medium|high",
      "implementation_notes": "Notes for the engineer implementing this"
    }
  ]
}`;

    let proposals: Record<string, unknown>[] = [];
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [{ role: "user", content: analysisPrompt }],
        temperature: 0.2,
        max_tokens: 2048,
        response_format: { type: "json_object" },
      });
      const raw = completion.choices[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(raw);
      proposals = (parsed.proposals ?? []).filter(
        (p: Record<string, unknown>) =>
          !existingFamilies.has(p.family as string) &&
          (p.request_count as number) >= min_request_count
      );
    } catch (err) {
      logger.warn("LLM analysis failed", { error: String(err) });
      return { proposals: [], unrecognized_count: unknownRecords.length, error: String(err) };
    }

    logger.log("Proposals generated", { count: proposals.length });

    // ── Insert proposals into capability_registry ─────────────
    const insertedProposals: string[] = [];
    for (const proposal of proposals) {
      try {
        const { data: inserted } = await supabase
          .from("capability_registry")
          .insert({
            family: proposal.family as string,
            display_name: proposal.display_name as string,
            description: proposal.description as string,
            required_dimensions: proposal.required_dimensions as string[],
            optional_dimensions: proposal.optional_dimensions as string[],
            status: "proposed",
            complexity: proposal.complexity as string,
            implementation_notes: proposal.implementation_notes as string,
            proposal_metadata: {
              request_count: proposal.request_count,
              example_transcripts: proposal.example_transcripts,
              proposed_at: new Date().toISOString(),
              lookback_days,
            },
          })
          .select("id")
          .single();

        if (inserted) {
          insertedProposals.push(proposal.family as string);
          logger.log("Inserted capability proposal", { family: proposal.family });
        }
      } catch (err) {
        logger.warn("Failed to insert proposal (may already exist)", {
          family: proposal.family,
          error: String(err),
        });
      }
    }

    // ── Write decision ledger entry ───────────────────────────
    await supabase.from("decision_ledger").insert({
      job_id: null,
      step: "propose_new_capability",
      decision_reason: `Proposed ${insertedProposals.length} new capabilities from ${unknownRecords.length} unrecognized requests over ${lookback_days} days`,
      inputs: { lookback_days, min_request_count, unrecognized_count: unknownRecords.length },
      outputs: { proposals: insertedProposals, proposal_count: insertedProposals.length },
    });

    return {
      unrecognized_count: unknownRecords.length,
      proposal_count: insertedProposals.length,
      proposals: insertedProposals,
    };
  },
});
