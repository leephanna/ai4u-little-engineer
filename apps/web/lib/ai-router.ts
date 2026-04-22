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
 *   DIRECT_MATCH     — confidence ≥ 85 AND no missing_dims → create job immediately
 *   SOFT_MATCH       — confidence ≥ 50 OR missing_dims present → show editable dims
 *   CUSTOM_GENERATE  — family === null but shape is describable → LLM CadQuery generation
 *   UNSUPPORTED      — family === null AND shape is not describable → graceful dead-end
 *
 * Custom-generate pre-flight:
 *   Before the LLM call, a keyword detector checks for organic/complex shape signals.
 *   If triggered, the router returns custom_generate immediately without an LLM call.
 *   This ensures rocket fins, nozzles, blades, etc. are NEVER mis-routed to spacer.
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
  /** Set to true when the LLM decides custom_generate is appropriate */
  use_custom_generate?: boolean;
  /** Cleaned-up description for the custom generator */
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
// Custom-generate keyword pre-flight detector
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Organic/complex shape keywords that ALWAYS trigger custom_generate.
 *
 * These are shapes that genuinely cannot be represented by any of the 11
 * parametric families, regardless of how the LLM maps them. The pre-flight
 * check runs BEFORE the LLM call to prevent mis-routing (e.g., "rocket" → spacer).
 *
 * Rule: if ANY of these phrases appear in the input, return custom_generate
 * immediately without calling the LLM router.
 */
const CUSTOM_GENERATE_KEYWORDS: string[] = [
  // Rocket / aerospace
  "fins",
  "fin ",
  "nose cone",
  "nosecone",
  "bell nozzle",
  "bell curve",
  "rocket nozzle",
  "nozzle bell",
  "engine nozzle",
  "thrust nozzle",
  "rocket shape",
  "rocket body",
  "rocket with",
  "rocket model",
  "propeller",
  "propellor",
  "turbine blade",
  "turbine blades",
  "rotor blade",
  "impeller",
  // Organic / biological
  "airfoil",
  "aerofoil",
  "naca ",
  "wing profile",
  "hydrofoil",
  "foil profile",
  // Mechanical complex
  "gear teeth",
  "gear with",
  "helical gear",
  "spur gear",
  "bevel gear",
  "worm gear",
  "rack and pinion",
  "involute",
  "cam profile",
  "eccentric cam",
  "lobe",
  "spline profile",
  "knurled",
  "knurling",
  // Artistic / organic shapes
  "organic shape",
  "curved body",
  "tapered body",
  "tapered with",
  "freeform",
  "free-form",
  "sculpted",
  "anatomical",
  "ergonomic grip",
  "contoured",
  "parametric surface",
  "loft",
  "lofted",
  "swept profile",
  "swept surface",
  "voronoi",
  "lattice structure",
  "gyroid",
  "triply periodic",
  // Multi-body / assemblies
  "multi-body",
  "multi body",
  "assembly with",
  "combined shape",
  "integrated features",
  "complex bracket",
  "custom bracket with",
  // Specific complex parts
  "hook shape",
  "s-curve",
  "s curve",
  "helix",
  "helical",
  "spiral shape",
  "coil shape",
  "phone stand with",
  "cable routing",
  "octagonal with",
  "chamfered edges",
  "chamfered corners",
  "filleted",
  "fillet radius",
  "draft angle",
  "undercut",
];

/**
 * Check if a user input contains organic/complex shape signals that require
 * custom CadQuery generation rather than parametric family mapping.
 *
 * Returns the matched keyword (for logging) or null if no match.
 */
export function detectCustomGenerateKeyword(input: string): string | null {
  const lower = input.toLowerCase();
  for (const kw of CUSTOM_GENERATE_KEYWORDS) {
    if (lower.includes(kw)) return kw;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// System prompt
// ─────────────────────────────────────────────────────────────────────────────

const ROUTER_SYSTEM_PROMPT = `You are a parametric CAD routing assistant for AI4U Little Engineer.
Your job is to map a user request to the best available 3D-printable part family, OR decide that the shape requires custom CadQuery generation.

CRITICAL: You MUST return the "family" field as EXACTLY one of these strings (case-sensitive), or null:
  "spacer" | "l_bracket" | "u_bracket" | "hole_plate" | "cable_clip" |
  "enclosure" | "flat_bracket" | "standoff_block" | "adapter_bushing" |
  "simple_jig" | "solid_block"

NEVER return human-readable names like "Rocket Model", "Cable Holder", "Electronics Enclosure", "Cylinder", "Box", etc.
These will break the system. Only the exact strings above are valid, or null.

Available part families and their required parameters:
- spacer: outer_diameter (mm), inner_diameter (mm), length (mm) — simple hollow cylinder only
- l_bracket: leg_a (mm), leg_b (mm), thickness (mm), width (mm) — L-shaped flat bracket
- u_bracket: pipe_od (mm), wall_thickness (mm), flange_width (mm), flange_length (mm) — U-shaped saddle
- hole_plate: length (mm), width (mm), thickness (mm), hole_count, hole_diameter (mm) — flat plate with holes
- cable_clip: cable_od (mm), wall_thickness (mm), base_width (mm) — simple cable routing clip
- enclosure: inner_length (mm), inner_width (mm), inner_height (mm), wall_thickness (mm) — rectangular box
- flat_bracket: length (mm), width (mm), thickness (mm) — flat rectangular plate
- standoff_block: base_width (mm), height (mm), hole_diameter (mm) — rectangular standoff post
- adapter_bushing: outer_diameter (mm), inner_diameter (mm), length (mm) — cylindrical bore adapter
- simple_jig: length (mm), width (mm), thickness (mm) — flat rectangular jig
- solid_block: length (mm), width (mm), height (mm) — solid rectangular block

DECISION RULES — read carefully:

RULE A — Use a parametric family (family: "name", use_custom_generate: false) ONLY when:
  - The shape is a simple geometric primitive (cylinder, box, L-shape, U-shape, flat plate, etc.)
  - The shape has NO organic curves, fins, nozzle bells, airfoils, gear teeth, or complex profiles
  - The parametric family can faithfully represent the geometry (not just approximate it)
  - Confidence ≥ 85 means the family is a genuinely good fit

RULE B — Use custom_generate (family: null, use_custom_generate: true) when:
  - The shape has fins, wings, nozzle bells, airfoils, or swept/lofted profiles
  - The shape has gear teeth, cam profiles, helical features, or involute curves
  - The shape is organic, sculpted, ergonomic, or has complex curvature
  - The shape has multiple integrated features that no single parametric family can represent
  - The best parametric match would be a poor approximation (confidence < 85)
  - Examples: rocket with fins, bell nozzle, turbine blade, gear, propeller, phone stand with routing, hook

RULE C — Use unsupported (family: null, use_custom_generate: false) ONLY for:
  - Living creatures (animals, humans, faces)
  - Abstract concepts (emotions, ideas)
  - Functional mechanisms requiring assembly (motors, engines, electronics)
  - Software or digital objects

IMPORTANT: Do NOT force a parametric family onto a complex shape just to avoid custom_generate.
A rocket with fins is NOT a spacer. A bell nozzle is NOT a spacer. A gear is NOT a solid_block.
When in doubt between a poor parametric match and custom_generate, ALWAYS choose custom_generate.

Confidence scoring:
- 90-100: Perfect fit, all required dims present or easily inferred
- 75-89: Good fit, minor dimension inference needed
- 50-74: Approximate fit, significant geometry mismatch
- <50: Poor fit — use custom_generate instead

Rules for parametric families:
1. Only set use_custom_generate: false when confidence ≥ 85
2. If confidence < 85 for ALL parametric families, set family: null, use_custom_generate: true
3. Infer dimensions from context clues. If none given, use sensible defaults.
   EXCEPTION: For cable_clip, NEVER default wall_thickness or base_width — add to missing_dims.
   EXCEPTION: For enclosure, NEVER default wall_thickness — add to missing_dims.
   EXCEPTION: For u_bracket, NEVER default flange_width or flange_length — add to missing_dims.
4. Return confidence 0-100 based on how well the request maps to the family
5. Include a one-sentence human-readable explanation of your reasoning
6. List any dimensions you could NOT infer from the input in missing_dims
7. If you need one key piece of info to resolve ambiguity, put a targeted question in clarification_question
8. When web search context is provided, extract physical dimensions and use them. Note in explanation.

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

  // RULE: Raise the direct_match threshold to 85 to reduce false positives.
  // Only return direct_match when: confidence ≥ 85 AND no missing dims.
  if (llm.confidence >= 85 && !hasMissingDims) return "direct_match";

  // Everything else with a valid family → soft_match (show editable dims panel)
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
 *
 * Pre-flight: checks for organic/complex shape keywords BEFORE the LLM call.
 * If a keyword matches, returns custom_generate immediately.
 */
export async function runAiRouter(
  userInput: string,
  openai: OpenAI
): Promise<AiRouterResult | null> {
  try {
    // ── Pre-flight: organic/complex shape keyword detector ───────────────────
    // This runs BEFORE the LLM call to prevent mis-routing of complex shapes.
    // E.g., "rocket with 4 fins" would otherwise be mapped to "spacer".
    const customKw = detectCustomGenerateKeyword(userInput);
    if (customKw) {
      console.log(
        `[ai-router] custom_generate pre-flight triggered by keyword: "${customKw}" in: "${userInput.slice(0, 80)}"`
      );
      return {
        outcome: "custom_generate",
        family: null,
        parameters: {},
        confidence: 0,
        explanation: `Shape contains complex geometry ("${customKw}") that requires custom CadQuery generation.`,
        missing_dims: [],
        clarification_question: null,
        used_web_search: false,
        custom_description: userInput.trim(),
      };
    }

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
        // default to custom_generate (better than dead-end unsupported).
        if (!llm.use_custom_generate) {
          llm.use_custom_generate = true;
          llm.custom_description = userInput.trim();
        }
      }
    }

    // ── Post-LLM confidence gate ──────────────────────────────────────────────
    // If the LLM returned a family but with low confidence (< 60), and did NOT
    // explicitly set use_custom_generate, force custom_generate. This catches
    // cases where the LLM maps a complex shape to a family but is uncertain.
    if (
      llm.family !== null &&
      llm.confidence < 60 &&
      !llm.use_custom_generate
    ) {
      console.log(
        `[ai-router] Post-LLM confidence gate: confidence=${llm.confidence} < 60 for family="${llm.family}" — routing to custom_generate`
      );
      llm.family = null;
      llm.use_custom_generate = true;
      llm.custom_description = userInput.trim();
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
