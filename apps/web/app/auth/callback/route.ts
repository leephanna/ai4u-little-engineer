import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Canonical app origin — used so redirects always resolve to production
// even when the callback arrives on a Vercel preview URL.
const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://ai4u-little-engineer-web.vercel.app";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // Fix 2: Detect OAuth error params FIRST — before touching the code.
  // Supabase GoTrue sends error_code / error when state is missing or flow is broken.
  const errorCode = searchParams.get("error_code");
  const errorParam = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  if (errorCode || errorParam) {
    // Fail gracefully: redirect ONCE to the gateway with a readable error param.
    // Do NOT redirect to /login — that creates a redirect loop.
    const params = new URLSearchParams({
      auth_error: errorCode ?? errorParam ?? "unknown",
    });
    if (errorDescription) {
      params.set("auth_error_detail", errorDescription);
    }
    return NextResponse.redirect(`${APP_URL}/little-engineer?${params.toString()}`);
  }

  const code = searchParams.get("code");

  // Fix 3: Only exchange session when a valid code exists.
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Honour the ?next= param if it is a safe relative path.
      const next = searchParams.get("next") ?? "/invent";
      const safePath = next.startsWith("/") ? next : "/invent";
      return NextResponse.redirect(`${APP_URL}${safePath}`);
    }

    // Exchange failed — redirect to gateway with error, NOT to /login.
    return NextResponse.redirect(
      `${APP_URL}/little-engineer?auth_error=session_exchange_failed`
    );
  }

  // No code and no error params — probably a direct hit on /auth/callback.
  // Send to gateway, not login.
  return NextResponse.redirect(`${APP_URL}/little-engineer`);
}
