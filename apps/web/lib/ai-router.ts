/**
 * AI4U Little Engineer — Adaptive AI Router
 *
 * Replaces the rigid NLU pattern-matcher with an LLM-powered router that maps
 * ANY natural language input to the best available part family.
 *
 * This module is called ONLY when the primitive normalizer returns null.
 * The normalizer fast-path (cube, cylinder, spacer, standoff) is always tried
 * first and is never replaced by this module.
 *
 * Router outcomes:
 *   DIRECT_MATCH  — confidence ≥ 75 AND no missing_dims → create job immediately
 *   SOFT_MATCH    — confidence ≥ 50 OR missing_dims present → show editable dims
 *   UNSUPPORTED   — family === null → graceful dead-end with suggestions
 *
 * The router makes a single gpt-4.1-mini call with structured JSON output.
 * If the LLM call fails, the caller falls back to the existing INVENTION_SYSTEM_PROMPT
 * path (no regression).
 */

import OpenAI from "openai";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type RouterOutcome = "direct_match" | "soft_match" | "unsupported";

export interface AiRouterResult {
  /** Outcome classification */
  outcome: RouterOutcome;
  /** Part family, or null for unsupported */
  family: string | null;
  /** Inferred or defaulted dimensions */
  parameters: Record<string, number>;
  /** 0–100 confidence score */
  confidence: number;
  /** One-sentence human-readable explanation */
  explanation: string;
  /** Dims the LLM could not infer from the input */
  missing_dims: string[];
  /** Targeted clarification question, or null */
  clarification_question: string | null;
}

// Raw JSON schema the LLM must return
interface RouterLlmResponse {
  family: string | null;
  parameters: Record<string, number>;
  confidence: number;
  explanation: string;
  missing_dims: string[];
  clarification_question: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// System prompt
// ─────────────────────────────────────────────────────────────────────────────

const ROUTER_SYSTEM_PROMPT = `You are a parametric CAD routing assistant for AI4U Little Engineer.
Your job is to map any user request to the best available 3D-printable part family and infer reasonable default dimensions.

Available part families and their required parameters:
- spacer: outer_diameter (mm), inner_diameter (mm), length (mm)
- l_bracket: width (mm), height (mm), thickness (mm), flange_length (mm)
- u_bracket: width (mm), height (mm), thickness (mm), depth (mm)
- hole_plate: length (mm), width (mm), thickness (mm), hole_count, hole_diameter (mm)
- cable_clip: cable_diameter (mm), thickness (mm), width (mm)
- enclosure: length (mm), width (mm), height (mm), wall_thickness (mm)
- flat_bracket: length (mm), width (mm), thickness (mm)
- standoff_block: base_width (mm), height (mm), hole_diameter (mm)
- adapter_bushing: outer_diameter (mm), inner_diameter (mm), length (mm)
- simple_jig: length (mm), width (mm), height (mm)
- solid_block: length (mm), width (mm), height (mm)

Rules:
1. Always pick the CLOSEST family even for unusual requests (e.g. "rocket" → spacer or standoff_block)
2. For organic/impossible shapes (car engine, human face, living creature), return family: null with a helpful suggestion
3. Infer dimensions from context clues. If none given, use sensible defaults for the part type (e.g. spacer default: outer_diameter=20, inner_diameter=5, length=10)
4. Return confidence 0-100 based on how well the request maps to the family
5. Include a one-sentence human-readable explanation of your reasoning
6. List any dimensions you could NOT infer from the input in missing_dims
7. If you need one key piece of info to resolve ambiguity, put a targeted question in clarification_question

Return ONLY valid JSON matching this schema (no markdown, no extra text):
{
  "family": string | null,
  "parameters": { [key: string]: number },
  "confidence": number,
  "explanation": string,
  "missing_dims": string[],
  "clarification_question": string | null
}`;

// ─────────────────────────────────────────────────────────────────────────────
// Outcome classifier
// ─────────────────────────────────────────────────────────────────────────────

function classifyOutcome(llm: RouterLlmResponse): RouterOutcome {
  if (!llm.family) return "unsupported";
  const hasMissingDims = llm.missing_dims && llm.missing_dims.length > 0;
  if (llm.confidence >= 75 && !hasMissingDims) return "direct_match";
  if (llm.confidence >= 50 || hasMissingDims) return "soft_match";
  return "unsupported";
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Route a user's natural language input to the best part family.
 *
 * Returns null if the LLM call fails (caller should fall back to existing flow).
 *
 * IMPORTANT: This function is NEVER called when the primitive normalizer
 * already matched. The normalizer fast-path takes priority.
 */
export async function runAiRouter(
  userInput: string,
  openai: OpenAI
): Promise<AiRouterResult | null> {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: ROUTER_SYSTEM_PROMPT },
        { role: "user", content: userInput.trim().slice(0, 800) },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 400,
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const llm = JSON.parse(raw) as RouterLlmResponse;

    // Validate minimal shape
    if (typeof llm !== "object" || llm === null) return null;
    if (typeof llm.confidence !== "number") return null;
    if (!llm.parameters || typeof llm.parameters !== "object") {
      llm.parameters = {};
    }
    if (!Array.isArray(llm.missing_dims)) llm.missing_dims = [];
    if (!llm.explanation) llm.explanation = "Mapped to closest available part family.";

    const outcome = classifyOutcome(llm);

    return {
      outcome,
      family: llm.family ?? null,
      parameters: llm.parameters,
      confidence: Math.max(0, Math.min(100, llm.confidence)),
      explanation: llm.explanation,
      missing_dims: llm.missing_dims,
      clarification_question: llm.clarification_question ?? null,
    };
  } catch (err) {
    console.error("[ai-router] LLM call failed:", err);
    return null;
  }
}
