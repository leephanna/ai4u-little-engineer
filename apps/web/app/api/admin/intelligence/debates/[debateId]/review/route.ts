/**
 * POST /api/admin/intelligence/debates/[debateId]/review
 * Operator approves or rejects a Harmonia debate decision.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ debateId: string }> }
) {
  const { debateId } = await params;

  // Auth: must be admin
  const supabaseUser = await createClient();
  const { data: { user } } = await supabaseUser.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabaseUser
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { decision, notes } = body as { decision?: string; notes?: string };

  if (!decision || !["approved", "rejected"].includes(decision)) {
    return NextResponse.json({ error: "decision must be 'approved' or 'rejected'" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { error } = await supabase
    .from("intelligence_debates")
    .update({
      operator_reviewed: true,
      operator_decision: decision,
      operator_notes: notes ?? null,
      operator_reviewed_at: new Date().toISOString(),
      operator_reviewed_by: user.id,
    })
    .eq("id", debateId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Write to decision ledger
  try {
    await supabase.from("decision_ledger").insert({
      job_id: null,
      step: "operator_review",
      decision_reason: `Operator ${decision} debate ${debateId}${notes ? `: ${notes}` : ""}`,
      inputs: { debate_id: debateId, decision },
      outputs: { reviewed_by: user.id, reviewed_at: new Date().toISOString() },
    });
  } catch { /* non-blocking */ }

  return NextResponse.json({ success: true, decision });
}
