import { NextRequest, NextResponse } from "next/server";

// Legacy Supabase auth callback — replaced by Clerk.
// Clerk handles its own callback internally via /api/auth/callback/clerk.
// Any direct hits on this route are redirected to the Clerk sign-in page.
export async function GET(_request: NextRequest) {
  return NextResponse.redirect(
    new URL("/sign-in", _request.url)
  );
}
