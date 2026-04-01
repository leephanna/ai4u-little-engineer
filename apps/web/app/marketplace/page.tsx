/**
 * /marketplace
 *
 * Ranked design marketplace. Shows public projects sorted by success_score.
 * Free designs show a direct download button.
 * Paid designs show a price badge and a "Buy" button that triggers Stripe checkout.
 * Authenticated users see "Owned" badges for designs they have purchased.
 *
 * Trust Policy Gate (Migration 008):
 *   Only designs with marketplace_allowed = true are shown.
 *   This is set by the Trust Policy Engine after VPL evaluation.
 *   Unverified and low-confidence designs are silently excluded.
 */

import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import MarketplaceClient from "./MarketplaceClient";

interface Project {
  id: string;
  title: string;
  description: string | null;
  family: string;
  price: number | null;
  is_public: boolean;
  stl_url: string | null;
  step_url: string | null;
  success_score: number | null;
  success_rate: number | null;
  successful_prints: number;
  failed_prints: number;
  best_material: string | null;
  usage_count: number;
  rating: number | null;
  earnings_total: number;
  creator_id: string | null;
  created_by: string | null;
  created_at: string;
  print_success_score: number | null;
  vpl_grade: string | null;
  // Trust Policy fields (added in migration 008)
  trust_tier: string | null;
  marketplace_allowed: boolean;
}

export default async function MarketplacePage() {
  const serviceSupabase = createServiceClient();
  const supabase = await createClient();

  // Get current user (optional — marketplace is public)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fetch top 50 public projects sorted by success_score.
  // Trust Policy Gate: only show designs where marketplace_allowed = true.
  // Designs without a trust evaluation (marketplace_allowed = false by default)
  // are excluded until the Trust Policy Engine approves them.
  const { data: projects } = await serviceSupabase
    .from("projects")
    .select(
      "id, title, description, family, price, is_public, stl_url, step_url, success_score, success_rate, successful_prints, failed_prints, best_material, usage_count, rating, earnings_total, creator_id, created_by, created_at, print_success_score, vpl_grade, trust_tier, marketplace_allowed"
    )
    .eq("is_public", true)
    .eq("marketplace_allowed", true)
    .order("success_score", { ascending: false, nullsFirst: false })
    .limit(50);

  // If user is logged in, fetch their purchased design IDs
  let ownedProjectIds: string[] = [];
  if (user) {
    const { data: purchases } = await serviceSupabase
      .from("design_purchases")
      .select("project_id")
      .eq("buyer_id", user.id)
      .eq("status", "completed");
    ownedProjectIds = (purchases ?? []).map((p) => p.project_id);

    // Also add designs the user created (they own their own designs)
    const createdIds = (projects ?? [])
      .filter((p) => p.creator_id === user.id || p.created_by === user.id)
      .map((p) => p.id);
    ownedProjectIds = [...new Set([...ownedProjectIds, ...createdIds])];
  }

  return (
    <MarketplaceClient
      projects={(projects ?? []) as Project[]}
      ownedProjectIds={ownedProjectIds}
      isAuthenticated={!!user}
    />
  );
}
