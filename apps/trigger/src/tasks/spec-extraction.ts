/**
 * Spec Extraction Task — Trigger.dev
 *
 * Processes a raw voice transcript and extracts a structured PartSpec
 * using GPT-4.1. Called when the voice session has enough context
 * to attempt spec extraction without further clarification.
 *
 * Task ID: spec-extraction
 */

import { task, logger, AbortTaskRunError } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { z } from "zod";

// ─────────────────────────────────────────────────────────────
// Payload schema
// ─────────────────────────────────────────────────────────────

const ExtractionPayload = z.object({
  job_id: z.string().uuid(),
  session_id: z.string(),
  transcript: z.string().min(1),
  conversation_history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .default([]),
});

type ExtractionPayload = z.infer<typeof ExtractionPayload>;

// ─────────────────────────────────────────────────────────────
// Extraction prompt
// ─────────────────────────────────────────────────────────────

const EXTRACTION_SYSTEM_PROMPT = `You are a precision part specification extractor for a 3D printing assistant.

Extract a complete PartSpec from the conversation. Return ONLY valid JSON.

Supported families: spacer, flat_bracket, l_bracket, u_bracket, hole_plate, standoff_block, cable_clip, enclosure, adapter_bushing, simple_jig

Output schema:
{
  "family": "string",
  "units": "mm" | "in",
  "material": "string or null",
  "dimensions": { "key": number },
  "load_requirements": {
    "estimated_static_load_lbs": number | null,
    "shock_load": boolean,
    "dynamic_load": boolean
  },
  "constraints": {
    "must_fit_within": [x, y, z] | null,
    "support_preference": "minimal" | "none" | "ok",
    "fastener_standard": "metric" | "imperial" | null
  },
  "printer_constraints": {
    "max_print_volume": [x, y, z] | null,
    "layer_height": number | null,
    "nozzle_size": number | null,
    "infill_percent": number | null
  },
  "assumptions": ["string"],
  "missing_fields": ["string"],
  "confidence": 0.0-1.0,
  "spec_complete": boolean
}

Rules:
- Set spec_complete=true only when ALL required dimensions for the family are present
- List every assumption you make in the assumptions array
- List every required dimension that is missing in missing_fields
- confidence reflects how certain you are about the extracted values`;

// ─────────────────────────────────────────────────────────────
// Main task
// ─────────────────────────────────────────────────────────────

export const specExtraction = task({
  id: "spec-extraction",
  maxDuration: 60,
  retry: {
    maxAttempts: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 5000,
  },

  run: async (payload: ExtractionPayload) => {
    const { job_id, session_id, transcript, conversation_history } =
      ExtractionPayload.parse(payload);

    logger.info("Spec extraction started", { job_id, session_id });

    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Build messages
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
      ...conversation_history,
      { role: "user", content: transcript },
    ];

    // Call GPT-4.1 for extraction
    let extractedSpec: Record<string, unknown>;
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages,
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 1000,
      });

      extractedSpec = JSON.parse(
        completion.choices[0].message.content ?? "{}"
      );
    } catch (err) {
      const errorMsg = `GPT-4.1 extraction failed: ${err instanceof Error ? err.message : String(err)}`;
      logger.error(errorMsg);
      throw new Error(errorMsg);
    }

    const confidence = (extractedSpec.confidence as number) ?? 0;
    const specComplete = (extractedSpec.spec_complete as boolean) ?? false;

    logger.log("Spec extracted", {
      family: extractedSpec.family,
      confidence,
      spec_complete: specComplete,
      missing_fields: extractedSpec.missing_fields,
    });

    // Save spec to database if complete enough (confidence > 0.5)
    let savedSpecId: string | null = null;

    if (confidence > 0.5 && extractedSpec.family) {
      // Get current spec version
      const { data: existingSpecs } = await supabase
        .from("part_specs")
        .select("version")
        .eq("job_id", job_id)
        .order("version", { ascending: false })
        .limit(1);

      const nextVersion = ((existingSpecs?.[0]?.version as number) ?? 0) + 1;

      const { data: savedSpec, error: saveError } = await supabase
        .from("part_specs")
        .insert({
          job_id,
          version: nextVersion,
          units: extractedSpec.units ?? "mm",
          family: extractedSpec.family,
          material: extractedSpec.material ?? null,
          dimensions_json: extractedSpec.dimensions ?? {},
          load_requirements_json: extractedSpec.load_requirements ?? {},
          constraints_json: extractedSpec.constraints ?? {},
          printer_constraints_json: extractedSpec.printer_constraints ?? {},
          assumptions_json: extractedSpec.assumptions ?? [],
          missing_fields_json: extractedSpec.missing_fields ?? [],
          created_by: "ai",
        })
        .select()
        .single();

      if (saveError) {
        logger.error("Failed to save spec", { error: saveError.message });
      } else {
        savedSpecId = savedSpec.id;

        // Update job
        await supabase
          .from("jobs")
          .update({
            status: specComplete ? "draft" : "clarifying",
            requested_family: extractedSpec.family as string,
            selected_family: specComplete ? (extractedSpec.family as string) : null,
            confidence_score: confidence,
            latest_spec_version: nextVersion,
          })
          .eq("id", job_id);
      }
    }

    return {
      job_id,
      spec_id: savedSpecId,
      family: extractedSpec.family,
      confidence,
      spec_complete: specComplete,
      missing_fields: extractedSpec.missing_fields ?? [],
      assumptions: extractedSpec.assumptions ?? [],
    };
  },
});
