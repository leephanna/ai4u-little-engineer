/**
 * GET /api/marketplace/purchases
 *
 * Returns the list of designs the current user has purchased.
 * Used by the marketplace UI to show "Owned" badges and unlock download buttons.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient();
    const serviceSupabase = createServiceClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: purchases, error } = await serviceSupabase
      .from("design_purchases")
      .select("project_id, status, amount_paid, completed_at")
      .eq("buyer_id", user.id)
      .eq("status", "completed")
      .order("completed_at", { ascending: false });

    if (error) {
      console.error("Purchases fetch error:", error);
      return NextResponse.json({ error: "Failed to fetch purchases" }, { status: 500 });
    }

    return NextResponse.json({
      purchases: purchases ?? [],
      owned_project_ids: (purchases ?? []).map((p) => p.project_id),
    });
  } catch (err) {
    console.error("Purchases list error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
