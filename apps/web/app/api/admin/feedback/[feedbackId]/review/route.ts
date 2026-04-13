/**
 * POST /api/admin/feedback/[feedbackId]/review
 *
 * Marks a print_feedback row as reviewed.
 * Admin-only endpoint.
 *
 * Phase 4: Operator console
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getAuthUser } from "@/lib/auth";

interface RouteContext {
  params: Promise<{ feedbackId: string }>;
}

export async function POST(_req: NextRequest, { params }: RouteContext) {
  const { feedbackId } = await params;

  // Auth check — admin only
  const supabase = await createClient();
    const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }


  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Mark as reviewed using service client
  const serviceClient = createServiceClient();
  const { error } = await serviceClient
    .from("print_feedback")
    .update({ review_status: "reviewed" })
    .eq("id", feedbackId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ reviewed: true });
}
