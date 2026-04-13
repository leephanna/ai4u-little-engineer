import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getAuthUser } from "@/lib/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ promptId: string }> }
) {
  const { promptId } = await params;
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServiceClient();
  const { data: profile } = await supabase.from("profiles").select("role").eq("clerk_user_id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { action } = await req.json().catch(() => ({})) as { action?: string };
  if (!action || !["promote", "reject"].includes(action)) {
    return NextResponse.json({ error: "action must be promote or reject" }, { status: 400 });
  }

  if (action === "promote") {
    // Archive any existing production prompt first
    await supabase
      .from("prompt_versions")
      .update({ status: "archived" })
      .eq("status", "production");

    const { error } = await supabase
      .from("prompt_versions")
      .update({
        status: "production",
        promoted_at: new Date().toISOString(),
        promoted_by: user.id,
      })
      .eq("id", promptId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await supabase
      .from("prompt_versions")
      .update({ status: "rejected" })
      .eq("id", promptId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, action });
}
