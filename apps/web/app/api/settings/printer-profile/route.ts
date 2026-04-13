/**
 * POST /api/settings/printer-profile  — create
 * PUT  /api/settings/printer-profile  — update
 * GET  /api/settings/printer-profile  — get default profile
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
    const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }


  const { data, error } = await supabase
    .from("printer_profiles")
    .select("*")
    .eq("clerk_user_id", user.id)
    .eq("is_default", true)
    .single();

  if (error) return NextResponse.json({ profile: null });
  return NextResponse.json({ profile: data });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
    const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }


  const body = await request.json();
  const { user_id: _uid, id: _id, created_at: _ca, updated_at: _ua, ...fields } = body;

  const { data, error } = await supabase
    .from("printer_profiles")
    .insert({ ...fields, clerk_user_id: user.id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ profile: data }, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const supabase = await createClient();
    const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }


  const body = await request.json();
  const { id, user_id: _uid, created_at: _ca, updated_at: _ua, ...fields } = body;

  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { data, error } = await supabase
    .from("printer_profiles")
    .update(fields)
    .eq("id", id)
    .eq("clerk_user_id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ profile: data });
}
