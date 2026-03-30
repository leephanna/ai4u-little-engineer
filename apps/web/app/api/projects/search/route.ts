/**
 * GET /api/projects/search
 *
 * Searchable project library endpoint.
 *
 * Query params:
 *   - q: string           — full-text search query
 *   - family: string      — filter by part family
 *   - limit: number       — max results (default 20, max 50)
 *   - offset: number      — pagination offset
 *   - sort: "recent"|"popular"|"rating"  — sort order
 *
 * Returns: { projects: Project[], total: number }
 *
 * Phase 6: Searchable project library
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const family = searchParams.get("family")?.trim() ?? "";
  const limitParam = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 50);
  const offset = Math.max(parseInt(searchParams.get("offset") ?? "0", 10), 0);
  const sort = searchParams.get("sort") ?? "popular";

  const supabase = createServiceClient();

  let query = supabase
    .from("projects")
    .select("id, title, description, family, parameters, stl_url, step_url, usage_count, rating, created_at, is_system", { count: "exact" });

  // Full-text search
  if (q) {
    query = query.textSearch("search_vector", q, {
      type: "websearch",
      config: "english",
    });
  }

  // Family filter
  if (family) {
    query = query.eq("family", family);
  }

  // Sort
  switch (sort) {
    case "recent":
      query = query.order("created_at", { ascending: false });
      break;
    case "rating":
      query = query.order("rating", { ascending: false, nullsFirst: false });
      break;
    case "popular":
    default:
      query = query.order("usage_count", { ascending: false });
      break;
  }

  query = query.range(offset, offset + limitParam - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error("Projects search error:", error.message);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }

  return NextResponse.json({
    projects: data ?? [],
    total: count ?? 0,
    offset,
    limit: limitParam,
  });
}
