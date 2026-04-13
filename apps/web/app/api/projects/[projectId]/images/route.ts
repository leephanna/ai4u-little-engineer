/**
 * POST /api/projects/[projectId]/images
 *
 * Generates AI concept images for a project using DALL-E 3.
 * Produces two image types:
 *   - render:  clean studio render of the 3D-printed part
 *   - context: real-world usage photo showing the part in context
 *
 * The generated images are stored in Supabase Storage (cad-artifacts bucket)
 * and their URLs are persisted in the project_images table.
 *
 * Auth: service role only (called from server-side flows or admin)
 * Rate limit: max 2 images per project per call (one of each type)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import OpenAI from "openai";
import { getAuthUser } from "@/lib/auth";


// ─────────────────────────────────────────────────────────────────────────────
// Prompt builders
// ─────────────────────────────────────────────────────────────────────────────
function buildRenderPrompt(family: string, material: string | null, dimensions: Record<string, unknown>): string {
  const dimStr = Object.entries(dimensions)
    .slice(0, 4)
    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}mm`)
    .join(", ");
  const mat = material ?? "PLA";
  const familyLabel = family.replace(/_/g, " ");
  return (
    `Professional studio product photography of a 3D-printed ${familyLabel}. ` +
    `Material: ${mat}. Key dimensions: ${dimStr}. ` +
    `Clean white background, soft directional lighting, sharp focus, ` +
    `photorealistic render, engineering precision, no text or labels. ` +
    `Shot from a 45-degree angle showing all key features.`
  );
}

function buildContextPrompt(family: string, material: string | null): string {
  const familyLabel = family.replace(/_/g, " ");
  const mat = material ?? "PLA";
  return (
    `Real-world usage photo of a 3D-printed ${familyLabel} made from ${mat}, ` +
    `installed and in use in a workshop or maker space environment. ` +
    `Natural lighting, realistic scene, shows the part performing its function. ` +
    `High quality DSLR photography, no text overlays, no watermarks.`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Route handler
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const supabase = await createClient();
  const serviceSupabase = createServiceClient();

  // Auth check
    const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch project
  const { data: project, error: projErr } = await serviceSupabase
    .from("projects")
    .select("id, title, family, creator_id, vpl_grade")
    .eq("id", projectId)
    .single();

  if (projErr || !project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Only project owner or admin can generate images
  if (project.creator_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Fetch latest part spec for dimensions and material
  const { data: spec } = await serviceSupabase
    .from("part_specs")
    .select("dimensions_json, material, family")
    .eq("job_id", projectId)
    .order("version", { ascending: false })
    .limit(1)
    .single();

  const family = (spec?.family ?? project.family ?? "mechanical part") as string;
  const material = (spec?.material ?? null) as string | null;
  const dimensions = (spec?.dimensions_json ?? {}) as Record<string, unknown>;

  // Check if images already exist
  const { data: existingImages } = await serviceSupabase
    .from("project_images")
    .select("image_type")
    .eq("project_id", projectId);

  const existingTypes = new Set((existingImages ?? []).map((i: { image_type: string }) => i.image_type));
  const typesToGenerate = (["render", "context"] as const).filter((t) => !existingTypes.has(t));

  if (typesToGenerate.length === 0) {
    // Return existing images
    const { data: images } = await serviceSupabase
      .from("project_images")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });
    return NextResponse.json({ images: images ?? [], generated: 0 });
  }

  const generated: Array<{ image_type: string; url: string }> = [];

  for (const imageType of typesToGenerate) {
    const prompt =
      imageType === "render"
        ? buildRenderPrompt(family, material, dimensions)
        : buildContextPrompt(family, material);

    try {
    const openai = new OpenAI();
      const response = await openai.images.generate({
        model: "dall-e-3",
        prompt,
        n: 1,
        size: "1024x1024",
        quality: "standard",
        response_format: "url",
      });

      const imageUrl = response.data?.[0]?.url;
      if (!imageUrl) continue;

      // Persist to project_images table
      const { data: inserted } = await serviceSupabase
        .from("project_images")
        .insert({
          project_id: projectId,
          image_type: imageType,
          url: imageUrl,
          prompt,
          model: "dall-e-3",
        })
        .select("*")
        .single();

      if (inserted) {
        generated.push({ image_type: imageType, url: imageUrl });
      }
    } catch (err) {
      console.error(`Image generation failed for type ${imageType}:`, err);
      // Non-fatal: continue with other types
    }
  }

  // Return all images for this project
  const { data: allImages } = await serviceSupabase
    .from("project_images")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  return NextResponse.json({
    images: allImages ?? [],
    generated: generated.length,
  });
}

// GET /api/projects/[projectId]/images — fetch existing images
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const serviceSupabase = createServiceClient();

  const { data: images, error } = await serviceSupabase
    .from("project_images")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ images: images ?? [] });
}
