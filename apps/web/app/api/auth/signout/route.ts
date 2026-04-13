import { NextRequest, NextResponse } from "next/server";

// Auth signout — replaced by Clerk.
// Clerk handles sign-out via its own SDK on the client side.
// This route now redirects to the Clerk sign-in page for any direct POST calls.
export async function POST(request: NextRequest) {
  return NextResponse.redirect(new URL("/sign-in", request.url));
}
