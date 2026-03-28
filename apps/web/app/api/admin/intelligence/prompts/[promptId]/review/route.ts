import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ promptId: string }> }
) {
  const { promptId } = await params;
  const supabaseUser = await createClient();
  const { data: { user } } = await supabaseUser.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabaseUser.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { action } = await req.json().catch(() => ({})) as { action?: string };
  if (!action || !["promote", "reject"].includes(action)) {
    return NextResponse.json({ error: "action must be promote or reject" }, { status: 400 });
  }

  const supabase = createServiceClient();

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
