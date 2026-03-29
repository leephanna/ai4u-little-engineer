/**
 * ai-providers.ts
 * ─────────────────────────────────────────────────────────────
 * Multi-AI provider abstraction layer for Harmonia Phase 2.
 *
 * Supported providers:
 *   • OpenAI  — gpt-4.1-mini (Proposer / Judge)
 *   • Anthropic — claude-3-haiku-20240307 (Critic)
 *   • Google — gemini-2.5-flash (Cluster / large-context)
 *
 * All calls return a normalised AiResponse object so callers
 * never need to handle provider-specific shapes.
 * ─────────────────────────────────────────────────────────────
 */

import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";

// ── Types ─────────────────────────────────────────────────────

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiResponse {
  provider: string;
  model: string;
  content: string;
  /** Parsed JSON content if response_format was json */
  parsed?: Record<string, unknown>;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  latency_ms: number;
  error?: string;
}

export interface AiCallOptions {
  temperature?: number;
  max_tokens?: number;
  json_mode?: boolean;
}

// ── Provider implementations ──────────────────────────────────

async function callOpenAI(
  model: string,
  messages: AiMessage[],
  opts: AiCallOptions = {}
): Promise<AiResponse> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const start = Date.now();
  try {
    const completion = await client.chat.completions.create({
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.max_tokens ?? 1024,
      ...(opts.json_mode ? { response_format: { type: "json_object" as const } } : {}),
    });
    const latency_ms = Date.now() - start;
    const content = completion.choices[0]?.message?.content ?? "";
    const usage = completion.usage;
    let parsed: Record<string, unknown> | undefined;
    if (opts.json_mode) {
      try { parsed = JSON.parse(content); } catch { /* ignore */ }
    }
    return {
      provider: "openai",
      model,
      content,
      parsed,
      input_tokens: usage?.prompt_tokens ?? 0,
      output_tokens: usage?.completion_tokens ?? 0,
      total_tokens: usage?.total_tokens ?? 0,
      latency_ms,
    };
  } catch (err) {
    return {
      provider: "openai", model, content: "",
      input_tokens: 0, output_tokens: 0, total_tokens: 0,
      latency_ms: Date.now() - start,
      error: String(err),
    };
  }
}

async function callAnthropic(
  model: string,
  messages: AiMessage[],
  opts: AiCallOptions = {}
): Promise<AiResponse> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const start = Date.now();
  try {
    // Anthropic requires system message to be separate
    const systemMsg = messages.find((m) => m.role === "system");
    const userMsgs = messages.filter((m) => m.role !== "system");
    const resp = await client.messages.create({
      model,
      max_tokens: opts.max_tokens ?? 1024,
      system: systemMsg?.content,
      messages: userMsgs.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    });
    const latency_ms = Date.now() - start;
    const content = resp.content[0]?.type === "text" ? resp.content[0].text : "";
    let parsed: Record<string, unknown> | undefined;
    if (opts.json_mode) {
      try { parsed = JSON.parse(content); } catch { /* ignore */ }
    }
    return {
      provider: "anthropic",
      model,
      content,
      parsed,
      input_tokens: resp.usage.input_tokens,
      output_tokens: resp.usage.output_tokens,
      total_tokens: resp.usage.input_tokens + resp.usage.output_tokens,
      latency_ms,
    };
  } catch (err) {
    return {
      provider: "anthropic", model, content: "",
      input_tokens: 0, output_tokens: 0, total_tokens: 0,
      latency_ms: Date.now() - start,
      error: String(err),
    };
  }
}

async function callGemini(
  model: string,
  messages: AiMessage[],
  opts: AiCallOptions = {}
): Promise<AiResponse> {
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY ?? "");
  const start = Date.now();
  try {
    const geminiModel = genAI.getGenerativeModel({ model });
    // Combine all messages into a single prompt for simplicity
    const prompt = messages
      .map((m) => `[${m.role.toUpperCase()}]\n${m.content}`)
      .join("\n\n");
    const result = await geminiModel.generateContent(prompt);
    const latency_ms = Date.now() - start;
    const content = result.response.text();
    let parsed: Record<string, unknown> | undefined;
    if (opts.json_mode) {
      // Strip markdown code fences if present
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      try { parsed = JSON.parse(cleaned); } catch { /* ignore */ }
    }
    const usage = result.response.usageMetadata;
    return {
      provider: "google",
      model,
      content,
      parsed,
      input_tokens: usage?.promptTokenCount ?? 0,
      output_tokens: usage?.candidatesTokenCount ?? 0,
      total_tokens: usage?.totalTokenCount ?? 0,
      latency_ms,
    };
  } catch (err) {
    return {
      provider: "google", model, content: "",
      input_tokens: 0, output_tokens: 0, total_tokens: 0,
      latency_ms: Date.now() - start,
      error: String(err),
    };
  }
}

// ── Public API ────────────────────────────────────────────────

export type Provider = "openai" | "anthropic" | "google";

export interface ModelSpec {
  provider: Provider;
  model: string;
}

// Default model assignments for Harmonia roles
export const HARMONIA_MODELS = {
  proposer: { provider: "openai" as Provider, model: "gpt-4.1-mini" },
  critic:   { provider: "anthropic" as Provider, model: "claude-haiku-4-5" },
  judge:    { provider: "openai" as Provider, model: "gpt-4.1-mini" },
  cluster:  { provider: "google" as Provider, model: "gemini-2.5-flash" },
} as const;

export async function callAI(
  spec: ModelSpec,
  messages: AiMessage[],
  opts: AiCallOptions = {}
): Promise<AiResponse> {
  switch (spec.provider) {
    case "openai":    return callOpenAI(spec.model, messages, opts);
    case "anthropic": return callAnthropic(spec.model, messages, opts);
    case "google":    return callGemini(spec.model, messages, opts);
    default:          throw new Error(`Unknown provider: ${spec.provider}`);
  }
}

/** Estimate cost in USD for a response (rough approximation) */
export function estimateCostUsd(resp: AiResponse): number {
  const rates: Record<string, { in: number; out: number }> = {
    "gpt-4.1-mini":              { in: 0.0004,  out: 0.0016  },
    "claude-3-haiku-20240307":   { in: 0.00025, out: 0.00125 },
    "claude-haiku-4-5":          { in: 0.00025, out: 0.00125 },
    "gemini-2.5-flash":          { in: 0.00015, out: 0.0006  },
  };
  const r = rates[resp.model] ?? { in: 0.001, out: 0.003 };
  return (resp.input_tokens / 1000) * r.in + (resp.output_tokens / 1000) * r.out;
}
