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
 *   DIRECT_MATCH     — confidence ≥ 75 AND no missing_dims → create job immediately
 *   SOFT_MATCH       — confidence ≥ 50 OR missing_dims present → show editable dims
 *   CUSTOM_GENERATE  — family === null but shape is describable → LLM CadQuery generation
 *   UNSUPPORTED      — family === null AND shape is not describable → graceful dead-end
 *
 * Web search:
 *   When the input contains proper nouns, brand names, or product references,
 *   a lightweight context lookup is performed BEFORE the main LLM call.
 *   Search uses Serper API (SERPER_API_KEY) if available, otherwise falls back
 *   to a knowledge-retrieval call using gpt-4.1-mini.
 *   Search has a 2-second timeout and is always optional — failure is silent.
 *   Search is NEVER triggered for inputs that already have explicit dimensions
 *   (those are handled by the primitive normalizer before this module runs).
 */

import OpenAI from "openai";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type RouterOutcome =
  | "direct_match"
  | "soft_match"
  | "custom_generate"
  | "unsupported";

export interface AiRouterResult {
  /** Outcome classification */
  outcome: RouterOutcome;
  /** Part family, or null for unsupported/custom_generate */
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
  /** Whether web search context was used */
  used_web_search: boolean;
  /**
   * For custom_generate: the cleaned-up description to send to the CAD worker.
   * Undefined for all other outcomes.
   */
  custom_description?: string;
}

// Raw JSON schema the LLM must return
interface RouterLlmResponse {
  family: string | null;
  parameters: Record<string, number>;
  confidence: number;
  explanation: string;
  missing_dims: string[];
  clarification_question: string | null;
  /** New field: set to true when the LLM decides custom_generate is appropriate */
  use_custom_generate?: boolean;
  /** New field: cleaned-up description for the custom generator */
  custom_description?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Valid family list — MUST match MVP_PART_FAMILIES in @ai4u/shared
// ─────────────────────────────────────────────────────────────────────────────

export const VALID_FAMILIES = [
  "spacer",
  "l_bracket",
  "u_bracket",
  "hole_plate",
  "cable_clip",
  "enclosure",
  "flat_bracket",
  "standoff_block",
  "adapter_bushing",
  "simple_jig",
  "solid_block",
] as const;

export type ValidFamily = (typeof VALID_FAMILIES)[number];

// ─────────────────────────────────────────────────────────────────────────────
// System prompt
// ─────────────────────────────────────────────────────────────────────────────

const ROUTER_SYSTEM_PROMPT = `You are a parametric CAD routing assistant for AI4U Little Engineer.
Your job is to map any user request to the best available 3D-printable part family and infer reasonable default dimensions.

CRITICAL: You MUST return the "family" field as EXACTLY one of these strings (case-sensitive), or null if no family fits:
  "spacer" | "l_bracket" | "u_bracket" | "hole_plate" | "cable_clip" |
  "enclosure" | "flat_bracket" | "standoff_block" | "adapter_bushing" |
  "simple_jig" | "solid_block"

NEVER return human-readable names like "Rocket Model", "Cable Holder", "Electronics Enclosure", "Cylinder", "Box", etc.
These will break the system. Only the exact strings above are valid.

Mapping guide for unusual requests:
- rocket, missile, cylinder shape, tube, pipe → "spacer" (if hollow) or "standoff_block" (if solid post)
- box, enclosure, case, container, housing, shell → "enclosure"
- clip, holder, clamp for wires/cables → "cable_clip"
- plate with holes, mounting plate, perforated plate → "hole_plate"
- bracket, angle bracket, L-shape, corner mount → "l_bracket"
- U-shape, saddle, pipe clamp → "u_bracket"
- flat plate, strap, bar, shelf bracket → "flat_bracket"
- bushing, sleeve, adapter, bore reducer → "adapter_bushing"
- block, cube, rectangular solid, box without lid → "solid_block"
- jig, fixture, alignment tool, drill guide → "simple_jig"
- post, standoff, riser, pillar, column, pedestal → "standoff_block"
- ring, washer, spacer, tube, hollow cylinder → "spacer"

Available part families and their required parameters:
- spacer: outer_diameter (mm), inner_diameter (mm), length (mm)
- l_bracket: leg_a (mm), leg_b (mm), thickness (mm), width (mm)
- u_bracket: pipe_od (mm), wall_thickness (mm), flange_width (mm), flange_length (mm)
- hole_plate: length (mm), width (mm), thickness (mm), hole_count, hole_diameter (mm)
- cable_clip: cable_od (mm), wall_thickness (mm), base_width (mm)
- enclosure: inner_length (mm), inner_width (mm), inner_height (mm), wall_thickness (mm)
- flat_bracket: length (mm), width (mm), thickness (mm)
- standoff_block: base_width (mm), height (mm), hole_diameter (mm)
- adapter_bushing: outer_diameter (mm), inner_diameter (mm), length (mm)
- simple_jig: length (mm), width (mm), thickness (mm)
- solid_block: length (mm), width (mm), height (mm)

CUSTOM GENERATE option:
When the user requests a shape that:
- Cannot be reasonably mapped to ANY of the 11 families above, AND
- Is a describable physical object (not a living creature, not a concept, not software), AND
- Could be 3D printed (e.g., organic shapes, complex mechanical parts, artistic objects, custom brackets with unusual geometry, multi-feature parts)
Then set: "family": null, "use_custom_generate": true, "custom_description": "<cleaned up description for CadQuery>"

Examples that should use custom_generate:
- "design a turbine blade" → custom_generate
- "create a phone stand with cable routing" → custom_generate
- "make an octagonal mounting plate with chamfered edges" → custom_generate
- "design a gear with 20 teeth" → custom_generate
- "create a hook for hanging tools" → custom_generate

Examples that should NOT use custom_generate (use a parametric family instead):
- "make a spacer 20mm wide" → spacer
- "I need a box for my Arduino" → enclosure
- "cable clip for 5mm wire" → cable_clip

Examples that are truly unsupported (family: null, use_custom_generate: false):
- "design a human face" → unsupported (organic/biological)
- "create a working motor" → unsupported (functional mechanism, not printable)
- "make a cat" → unsupported (living creature)

Rules:
1. Always pick the CLOSEST family from the list above, even for unusual requests (e.g. "rocket" → "spacer" or "standoff_block")
2. Only set use_custom_generate: true when the shape genuinely cannot be represented by any parametric family
3. Infer dimensions from context clues. If none given, use sensible defaults for the part type (e.g. spacer default: outer_diameter=20, inner_diameter=5, length=10)
   EXCEPTION: For cable_clip, NEVER default wall_thickness or base_width — always add them to missing_dims if not explicitly stated.
   EXCEPTION: For enclosure, NEVER default wall_thickness — always add it to missing_dims if not explicitly stated.
   EXCEPTION: For u_bracket, NEVER default flange_width or flange_length — always add them to missing_dims if not explicitly stated.
4. Return confidence 0-100 based on how well the request maps to the family
5. Include a one-sentence human-readable explanation of your reasoning
6. List any dimensions you could NOT infer from the input in missing_dims
7. If you need one key piece of info to resolve ambiguity, put a targeted question in clarification_question
8. When web search context is provided after the user's request, extract any physical dimensions (mm, cm, inches — convert to mm). Use those dimensions to fill in parameters. Prefer exact dimensions from the search context over generic defaults. Note in your explanation that you used reference dimensions from context.

Return ONLY valid JSON matching this schema (no markdown, no extra text):
{
  "family": string | null,
  "parameters": { [key: string]: number },
  "confidence": number,
  "explanation": string,
  "missing_dims": string[],
  "clarification_question": string | null,
  "use_custom_generate": boolean,
  "custom_description": string | null
}`;

// ─────────────────────────────────────────────────────────────────────────────
// Web search detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect whether a user input would benefit from web search context.
 *
 * Returns true for inputs containing:
 * - Proper nouns (brand names, product names, missions)
 * - Known product/brand signals
 * - Event or mission signals
 *
 * Returns false for inputs with explicit numeric dimensions — those are
 * handled by the primitive normalizer before this module runs.
 */
export function needsWebSearch(input: string): boolean {
  const inputLower = input.toLowerCase();

  // If the input already has explicit mm/cm/inch dimensions, the normalizer
  // would have caught it. But if we're here, it means the normalizer didn't
  // match — so we still check for product references.

  // Known product/brand signals
  const productSignals = [
    "raspberry pi",
    "arduino",
    "gopro",
    "iphone",
    "samsung",
    "nasa",
    "artemis",
    "spacex",
    "nozzle",
    "hotend",
    "esp32",
    "esp8266",
    "stm32",
    "jetson",
    "nvidia",
    "nema",
    "hero 12",
    "hero12",
    "pi zero",
    "pi 4",
    "pi 5",
    "pico",
  ];

  // Event / mission signals
  const eventSignals = [
    "mission",
    "launch",
    "rocket",
    "satellite",
    "probe",
    "lander",
    "rover",
  ];

  const hasProductSignal = productSignals.some((s) => inputLower.includes(s));
  const hasEventSignal = eventSignals.some((s) => inputLower.includes(s));

  // Proper noun detection: capitalized word(s) not at start of sentence
  // e.g. "Mount for Raspberry Pi 5" → "Raspberry", "Pi"
  // Strip leading word (likely capitalized as first word of sentence)
  const withoutFirstWord = input.replace(/^\S+\s*/, "");
  const hasProperNoun = /\b[A-Z][a-z]{1,}(?:\s+[A-Z0-9][a-z0-9]*)*\b/.test(
    withoutFirstWord
  );

  return hasProductSignal || hasEventSignal || hasProperNoun;
}

// ─────────────────────────────────────────────────────────────────────────────
// Web search helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch a 2-3 sentence context summary for the given query.
 *
 * Strategy:
 * 1. If SERPER_API_KEY is set, use Serper (Google Search API)
 * 2. Otherwise, use gpt-4.1-mini as a knowledge retrieval tool
 *    (it knows product dimensions from training data)
 *
 * Always has a 2-second timeout. Returns empty string on any failure.
 */
async function searchForContext(
  query: string,
  openai: OpenAI
): Promise<string> {
  const serperKey = process.env.SERPER_API_KEY;

  type ChatResult = Awaited<
    ReturnType<typeof openai.chat.completions.create>
  >;

  try {
    if (serperKey) {
      // Use Serper (Google Search) for real-time results
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);

      try {
        const response = await fetch("https://google.serper.dev/search", {
          method: "POST",
          headers: {
            "X-API-KEY": serperKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ q: query, num: 3 }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!response.ok) return "";

        const data = (await response.json()) as {
          organic?: Array<{ snippet?: string }>;
        };
        const snippets = data.organic
          ?.slice(0, 3)
          .map((r) => r.snippet)
          .filter(Boolean)
          .join(" ");

        return snippets ?? "";
      } finally {
        clearTimeout(timeout);
      }
    } else {
      // Fallback: use gpt-4.1-mini as a knowledge retrieval tool
      // This works well for well-known products (RPi, Arduino, GoPro, etc.)
      const completion = await Promise.race<ChatResult>([
        openai.chat.completions.create({
          model: "gpt-4.1-mini",
          messages: [
            {
              role: "system",
              content:
                "You are a product dimensions lookup assistant. Answer ONLY with physical dimensions in mm (length × width × height or diameter). Be concise — 1-2 sentences max. If you don't know the exact dimensions, say so briefly.",
            },
            {
              role: "user",
              content: query,
            },
          ],
          max_tokens: 80,
          temperature: 0,
          stream: false,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("search timeout")), 2000)
        ),
      ]);

      return (
        (
          completion as {
            choices: Array<{ message: { content: string | null } }>;
          }
        ).choices[0]?.message?.content ?? ""
      );
    }
  } catch (err) {
    // Silent failure — search is always optional
    console.warn("[ai-router] searchForContext failed:", (err as Error).message);
    return "";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Outcome classifier
// ─────────────────────────────────────────────────────────────────────────────

function classifyOutcome(llm: RouterLlmResponse): RouterOutcome {
  // If no valid family was identified, check for custom_generate
  if (!llm.family) {
    if (llm.use_custom_generate === true) return "custom_generate";
    return "unsupported";
  }

  const hasMissingDims = llm.missing_dims && llm.missing_dims.length > 0;

  // RULE: If a valid family is identified, the minimum outcome is soft_match.
  // The number of missing dims does NOT determine whether soft_match shows —
  // it only determines whether the Generate button is enabled.
  // Only return direct_match when: confidence ≥ 75 AND no missing dims.
  if (llm.confidence >= 75 && !hasMissingDims) return "direct_match";

  // Everything else with a valid family → soft_match (show editable dims panel)
  // This includes: confidence < 50, any number of missing dims, etc.
  return "soft_match";
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
    let contextAddendum = "";
    let usedWebSearch = false;

    // ── Web search context injection ─────────────────────────────────────────
    // Only triggered for inputs with proper nouns, brand names, or product refs.
    // Explicit-dimension inputs are handled by the normalizer before this runs.
    if (needsWebSearch(userInput)) {
      try {
        const searchResult = await searchForContext(
          `${userInput} dimensions size mm physical specifications`,
          openai
        );
        if (searchResult && searchResult.trim().length > 10) {
          contextAddendum = `\n\nWeb search context for this request:\n${searchResult}\n\nUse this context to infer dimensions if the user didn't specify them explicitly.`;
          usedWebSearch = true;
          console.log(
            `[ai-router] Web search used for: "${userInput.slice(0, 60)}"`
          );
        }
      } catch (e) {
        console.warn(
          "[ai-router] Web search failed, proceeding without context:",
          e
        );
      }
    }

    // ── Main LLM routing call ────────────────────────────────────────────────
    const userMessage = (userInput.trim().slice(0, 800) + contextAddendum).slice(
      0,
      1200
    );

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: ROUTER_SYSTEM_PROMPT },
        { role: "user", content: userMessage },
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

    // ── CRITICAL: Validate family is one of the allowed strings ──────────────
    // The LLM sometimes returns human-readable names like "Rocket Model" or
    // "Cable Holder" instead of the canonical family identifiers. Reject these.
    if (llm.family !== null) {
      const isValid = (VALID_FAMILIES as readonly string[]).includes(llm.family);
      if (!isValid) {
        console.warn(
          `[ai-router] LLM returned invalid family: "${llm.family}" — setting to null`
        );
        llm.family = null;
        llm.confidence = 0;
        llm.missing_dims = [];
        // If the LLM returned an invalid family but didn't flag custom_generate,
        // check if the description sounds like a describable physical object.
        // Default to custom_generate for safety (better than dead-end unsupported).
        if (!llm.use_custom_generate) {
          llm.use_custom_generate = true;
          llm.custom_description = userInput.trim();
        }
      }
    }

    const outcome = classifyOutcome(llm);

    // Build the custom_description for custom_generate outcomes
    const customDescription =
      outcome === "custom_generate"
        ? (llm.custom_description?.trim() || userInput.trim())
        : undefined;

    return {
      outcome,
      family: llm.family ?? null,
      parameters: llm.parameters,
      confidence: Math.max(0, Math.min(100, llm.confidence)),
      explanation: llm.explanation,
      missing_dims: llm.missing_dims,
      clarification_question: llm.clarification_question ?? null,
      used_web_search: usedWebSearch,
      custom_description: customDescription,
    };
  } catch (err) {
    console.error("[ai-router] LLM call failed:", err);
    return null;
  }
}
