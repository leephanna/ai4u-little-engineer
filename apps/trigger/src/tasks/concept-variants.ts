/**
 * Concept Variant Generation Task — Trigger.dev
 *
 * Generates multiple design variants for a given PartSpec:
 * - requested: exactly as specified
 * - stronger: increased wall thickness, larger fillets
 * - print_optimized: minimize supports, better layer adhesion
 *
 * Task ID: concept-variants
 */

import { task, logger, AbortTaskRunError } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { z } from "zod";

const VariantPayload = z.object({
  job_id: z.string().uuid(),
  part_spec_id: z.string().uuid(),
  variants: z
    .array(z.enum(["requested", "stronger", "print_optimized", "alternate"]))
    .default(["requested", "stronger", "print_optimized"]),
});

type VariantPayload = z.infer<typeof VariantPayload>;

const VARIANT_SYSTEM_PROMPT = `You are a mechanical design assistant specializing in 3D-printable parts.

Given a PartSpec, generate design variant descriptions for the requested variant types.
Return JSON with this schema:
{
  "variants": [
    {
      "variant_type": "requested|stronger|print_optimized|alternate",
      "description": "Brief description of this variant",
      "rationale": "Why this variant is useful",
      "score": {
        "printability": 0.0-1.0,
        "strength": 0.0-1.0,
        "material_efficiency": 0.0-1.0
      },
      "dimension_modifications": { "key": new_value }
    }
  ]
}

For "stronger": increase wall thickness by 25-50%, add fillets where possible
For "print_optimized": reduce overhangs, minimize supports, optimize orientation
For "alternate": suggest a completely different approach to the same problem`;

export const conceptVariants = task({
  id: "concept-variants",
  maxDuration: 60,
  retry: { maxAttempts: 2 },

  run: async (payload: VariantPayload) => {
    const { job_id, part_spec_id, variants } = VariantPayload.parse(payload);

    logger.info("Concept variant generation started", {
      job_id,
      part_spec_id,
      variants,
    });

    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Fetch the part spec
    const { data: spec, error: specError } = await supabase
      .from("part_specs")
      .select("*")
      .eq("id", part_spec_id)
      .single();

    if (specError || !spec) {
      throw new AbortTaskRunError(`Part spec not found: ${part_spec_id}`);
    }

    // Generate variant descriptions
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: VARIANT_SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify({
            family: spec.family,
            units: spec.units,
            material: spec.material,
            dimensions: spec.dimensions_json,
            requested_variants: variants,
          }),
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.4,
      max_tokens: 1200,
    });

    let variantData: { variants: Array<Record<string, unknown>> };
    try {
      variantData = JSON.parse(completion.choices[0].message.content ?? "{}");
    } catch {
      throw new Error("Failed to parse variant generation response");
    }

    // Save variants to database
    const savedVariants = [];
    for (const variant of variantData.variants ?? []) {
      const { data: saved, error } = await supabase
        .from("concept_variants")
        .insert({
          job_id,
          part_spec_id,
          variant_type: variant.variant_type,
          description: variant.description ?? null,
          rationale: variant.rationale ?? null,
          score_json: variant.score ?? {},
        })
        .select()
        .single();

      if (error) {
        logger.warn("Failed to save variant", {
          variant_type: variant.variant_type,
          error: error.message,
        });
      } else {
        savedVariants.push(saved);
      }
    }

    logger.info("Concept variants generated", {
      count: savedVariants.length,
      types: savedVariants.map((v) => v.variant_type),
    });

    return {
      job_id,
      part_spec_id,
      variants_created: savedVariants.length,
      variant_ids: savedVariants.map((v) => v.id),
    };
  },
});
