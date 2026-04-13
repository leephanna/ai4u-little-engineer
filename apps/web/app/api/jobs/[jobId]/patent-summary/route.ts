/**
 * POST /api/jobs/[jobId]/patent-summary
 *
 * Invention Protection Mode — generates a patent-ready technical summary
 * for a design, suitable for use in a provisional patent application or
 * as a timestamped proof-of-invention document.
 *
 * The summary includes:
 *   - Title of invention
 *   - Field of invention
 *   - Background (problem being solved)
 *   - Summary of the invention
 *   - Detailed description of the preferred embodiment
 *   - Claims (broad and specific)
 *   - Abstract
 *   - Key dimensions and materials
 *   - Timestamp and origin metadata
 *
 * The generated summary is stored in jobs.patent_summary_json for retrieval.
 *
 * Auth: job owner only
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import OpenAI from "openai";
import { getAuthUser } from "@/lib/auth";


const PATENT_SYSTEM_PROMPT = `You are a patent attorney specializing in mechanical engineering and 3D-printed devices.
Your task is to generate a structured patent-ready technical summary for a 3D-printed mechanical part.
This document will be used as a provisional patent application or proof-of-invention record.

Generate a comprehensive technical summary in the following JSON structure:
{
  "title": "Title of the invention (formal patent style)",
  "field": "Field of the invention (1-2 sentences)",
  "background": "Background of the invention — the problem being solved (2-3 paragraphs)",
  "summary": "Summary of the invention — what it does and its key advantages (1-2 paragraphs)",
  "description": "Detailed description of the preferred embodiment — how it works, key features, dimensions, materials (3-5 paragraphs)",
  "claims": [
    "Claim 1 (broadest independent claim)",
    "Claim 2 (dependent claim — specific feature)",
    "Claim 3 (dependent claim — material or process)",
    "Claim 4 (dependent claim — dimensional range)",
    "Claim 5 (method claim if applicable)"
  ],
  "abstract": "Abstract (150 words max, formal patent style)",
  "novelty_statement": "What makes this design novel and non-obvious",
  "prior_art_distinction": "How this design differs from known prior art",
  "industrial_applicability": "Commercial and industrial applications"
}

Be technically precise. Use formal patent language. Focus on the mechanical innovation.
All claims must be legally structured (e.g., "A device comprising...").`;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const supabase = await createClient();
  const serviceSupabase = createServiceClient();

  // Auth check
    const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch job and verify ownership
  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("id, user_id, title, selected_family, confidence_score, patent_summary_json")
    .eq("id", jobId)
    .single();

  if (jobErr || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Return cached summary if it exists
  const body = await req.json().catch(() => ({}));
  const forceRegenerate = (body as { force?: boolean }).force === true;

  if (job.patent_summary_json && !forceRegenerate) {
    return NextResponse.json({
      summary: job.patent_summary_json,
      cached: true,
    });
  }

  // Fetch latest part spec for detailed context
  const { data: spec } = await serviceSupabase
    .from("part_specs")
    .select("family, dimensions_json, material, notes, units")
    .eq("job_id", jobId)
    .order("version", { ascending: false })
    .limit(1)
    .single();

  // Fetch VPL results if available
  const { data: vplTest } = await serviceSupabase
    .from("virtual_print_tests")
    .select("print_success_score, grade, risk_level, issues")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  // Build context for LLM
  const family = spec?.family ?? job.selected_family ?? "mechanical part";
  const dimensions = spec?.dimensions_json ?? {};
  const material = spec?.material ?? "PLA";
  const units = spec?.units ?? "mm";
  const notes = spec?.notes ?? "";

  const dimStr = Object.entries(dimensions as Record<string, unknown>)
    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}${units}`)
    .join(", ");

  const vplContext = vplTest
    ? `VPL Score: ${vplTest.print_success_score}/100, Grade: ${vplTest.grade}, Risk: ${vplTest.risk_level}`
    : "VPL validation not yet performed";

  const userPrompt = `Generate a patent-ready technical summary for the following 3D-printed design:

Title: ${job.title}
Part Family: ${family.replace(/_/g, " ")}
Material: ${material}
Key Dimensions: ${dimStr || "Not specified"}
Design Notes: ${notes || "None"}
AI Confidence: ${job.confidence_score ? Math.round(job.confidence_score * 100) + "%" : "Not specified"}
Quality Validation: ${vplContext}

Generate the complete patent summary JSON as specified. Focus on the mechanical innovation and practical utility.`;

  try {
    const openai = new OpenAI();
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: PATENT_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const rawContent = completion.choices[0]?.message?.content;
    if (!rawContent) {
      return NextResponse.json({ error: "LLM returned empty response" }, { status: 500 });
    }

    const summary = JSON.parse(rawContent);

    // Add metadata
    const enrichedSummary = {
      ...summary,
      _metadata: {
        job_id: jobId,
        generated_at: new Date().toISOString(),
        origin: "ai_generated",
        platform: "AI4U Little Engineer",
        generator: "gpt-4.1-mini",
        vpl_grade: vplTest?.grade ?? null,
        vpl_score: vplTest?.print_success_score ?? null,
        copyright: "© AI4U, LLC. AI4Utech.com, Lee Hanna-Owner.",
      },
    };

    // Store in database
    await serviceSupabase
      .from("jobs")
      .update({ patent_summary_json: enrichedSummary })
      .eq("id", jobId);

    return NextResponse.json({ summary: enrichedSummary, cached: false });
  } catch (err) {
    console.error("Patent summary generation failed:", err);
    return NextResponse.json(
      { error: "Failed to generate patent summary" },
      { status: 500 }
    );
  }
}

// GET — retrieve stored patent summary
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const supabase = await createClient();

    const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: job } = await supabase
    .from("jobs")
    .select("user_id, patent_summary_json")
    .eq("id", jobId)
    .single();

  if (!job || job.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    summary: job.patent_summary_json ?? null,
    exists: !!job.patent_summary_json,
  });
}
