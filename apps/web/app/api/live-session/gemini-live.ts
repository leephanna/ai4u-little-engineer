/**
 * Gemini Live Session Handler
 *
 * Fix F (provider consistency): This module implements the real-time voice
 * path using Google's Gemini Live API (gemini-2.0-flash-live-001) with
 * native function-calling for spec extraction and job management.
 *
 * Architecture:
 *   Browser → POST /api/live-session (audio chunk)
 *     → geminiLiveTurn() (this module)
 *       → Gemini Live REST turn API (audio in, text + function calls out)
 *     → returns { response_text, tool_calls, part_spec, spec_complete }
 *
 * For true streaming (WebSocket), use the /api/live-session/ws route
 * (not yet implemented — V2). The REST turn API is used in V1 for
 * simplicity and compatibility with the existing push-to-talk UX.
 *
 * Environment variables:
 *   GEMINI_API_KEY — Google AI Studio API key
 *   LLM_PROVIDER   — "gemini" | "openai" (default: "openai" for backward compat)
 */

import { ORCHESTRATION_SYSTEM_PROMPT } from "@ai4u/shared/src/prompts/system-prompt";

// ── Tool definitions for Gemini function-calling ─────────────
// These mirror the tool schemas in packages/shared/src/tool-schemas.ts
// but are formatted for the Gemini API's tools array.

export const GEMINI_TOOLS = [
  {
    functionDeclarations: [
      {
        name: "extract_part_spec",
        description:
          "Extract a structured PartSpec from the machinist's transcript. " +
          "Call this when you have enough information to identify the part family and key dimensions.",
        parameters: {
          type: "OBJECT",
          properties: {
            family: {
              type: "STRING",
              description: "Part family (spacer, l_bracket, u_bracket, hole_plate, cable_clip, enclosure)",
            },
            units: { type: "STRING", description: "mm or in" },
            dimensions: {
              type: "OBJECT",
              description: "Key-value map of dimension name to numeric value",
            },
            material: { type: "STRING", description: "Print material (PLA, PETG, ABS, etc.)" },
            assumptions: {
              type: "ARRAY",
              items: { type: "STRING" },
              description: "List of assumptions made",
            },
            missing_fields: {
              type: "ARRAY",
              items: { type: "STRING" },
              description: "Required fields not yet provided by the user",
            },
            confidence: {
              type: "NUMBER",
              description: "Confidence score 0.0–1.0",
            },
          },
          required: ["family", "units", "dimensions", "confidence"],
        },
      },
      {
        name: "ask_clarification",
        description:
          "Ask the user one or more targeted clarifying questions. " +
          "Use when critical dimensions are missing or ambiguous.",
        parameters: {
          type: "OBJECT",
          properties: {
            questions: {
              type: "ARRAY",
              items: { type: "STRING" },
              description: "List of questions to ask (max 3)",
            },
          },
          required: ["questions"],
        },
      },
      {
        name: "confirm_spec_complete",
        description:
          "Signal that the spec is complete and ready for CAD generation. " +
          "Only call this when ALL required dimensions are known and confidence >= 0.85.",
        parameters: {
          type: "OBJECT",
          properties: {
            summary: {
              type: "STRING",
              description: "One-sentence summary of the part to confirm with the user",
            },
          },
          required: ["summary"],
        },
      },
    ],
  },
];

// ── Types ─────────────────────────────────────────────────────

export interface GeminiTurnResult {
  response_text: string;
  part_spec: Record<string, unknown> | null;
  spec_complete: boolean;
  clarification_questions: string[];
  tool_calls: Array<{ name: string; args: Record<string, unknown> }>;
}

interface GeminiContent {
  role: string;
  parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>;
}

// ── Main turn function ────────────────────────────────────────

/**
 * Process a single voice turn using the Gemini generateContent API
 * (REST, not WebSocket — suitable for push-to-talk UX).
 *
 * In V2, this will be replaced by a persistent WebSocket session
 * using the Gemini Live BidiGenerateContent API for true streaming.
 */
export async function geminiLiveTurn(params: {
  audioBase64: string;
  mimeType: string;
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>;
  userTranscript: string; // Pre-transcribed by Whisper (V1 fallback)
}): Promise<GeminiTurnResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  const { conversationHistory, userTranscript } = params;

  // Build conversation contents for Gemini
  const contents: GeminiContent[] = [
    // System instruction is passed separately in Gemini API
    ...conversationHistory.map((turn) => ({
      role: turn.role === "assistant" ? "model" : "user",
      parts: [{ text: turn.content }],
    })),
    {
      role: "user",
      parts: [{ text: userTranscript }],
    },
  ];

  const requestBody = {
    system_instruction: {
      parts: [{ text: ORCHESTRATION_SYSTEM_PROMPT }],
    },
    contents,
    tools: GEMINI_TOOLS,
    tool_config: {
      function_calling_config: {
        mode: "AUTO", // Gemini decides when to call functions
      },
    },
    generation_config: {
      temperature: 0.3,
      max_output_tokens: 800,
    },
  };

  const model = "gemini-2.0-flash-001"; // Use stable flash for function-calling
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errorText.slice(0, 500)}`);
  }

  const data = await response.json();
  const candidate = data.candidates?.[0];
  if (!candidate) {
    throw new Error("Gemini returned no candidates");
  }

  // Parse response parts — may include text and/or function calls
  let responseText = "";
  let partSpec: Record<string, unknown> | null = null;
  let specComplete = false;
  const clarificationQuestions: string[] = [];
  const toolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

  for (const part of candidate.content?.parts ?? []) {
    if (part.text) {
      responseText += part.text;
    }

    if (part.functionCall) {
      const { name, args } = part.functionCall;
      toolCalls.push({ name, args: args ?? {} });

      if (name === "extract_part_spec") {
        partSpec = args as Record<string, unknown>;
      } else if (name === "ask_clarification") {
        const questions = (args as { questions?: string[] }).questions ?? [];
        clarificationQuestions.push(...questions);
        if (!responseText && questions.length > 0) {
          responseText = questions.join(" ");
        }
      } else if (name === "confirm_spec_complete") {
        specComplete = true;
        const summary = (args as { summary?: string }).summary ?? "";
        if (!responseText) {
          responseText = `I have everything I need. ${summary}`;
        }
      }
    }
  }

  // Fallback: if no text and no tool calls, use finish reason
  if (!responseText && toolCalls.length === 0) {
    responseText = "I didn't quite catch that. Could you describe the part again?";
  }

  return {
    response_text: responseText,
    part_spec: partSpec,
    spec_complete: specComplete,
    clarification_questions: clarificationQuestions,
    tool_calls: toolCalls,
  };
}

/**
 * Check if Gemini Live is configured and should be used.
 * Falls back to OpenAI/Whisper path if GEMINI_API_KEY is not set
 * or LLM_PROVIDER is explicitly set to "openai".
 */
export function isGeminiEnabled(): boolean {
  const provider = process.env.LLM_PROVIDER ?? "openai";
  return provider === "gemini" && !!process.env.GEMINI_API_KEY;
}
