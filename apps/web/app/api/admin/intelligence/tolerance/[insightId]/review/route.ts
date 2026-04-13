import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getAuthUser } from "@/lib/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ insightId: string }> }
) {
  const { insightId } = await params;
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServiceClient();
  const { data: profile } = await supabase.from("profiles").select("role").eq("clerk_user_id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { action } = await req.json().catch(() => ({})) as { action?: string };
  if (!action || !["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "action must be approve or reject" }, { status: 400 });
  }
  const newStatus = action === "approve" ? "approved" : "rejected";

  const { error } = await supabase
    .from("tolerance_insights")
    .update({ status: newStatus, reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq("id", insightId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, status: newStatus });
}
