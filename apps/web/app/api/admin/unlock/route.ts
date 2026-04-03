/**
 * POST /api/admin/unlock
 *
 * Fallback owner unlock flow.
 *
 * Accepts the ADMIN_BYPASS_KEY in the request body and, if valid, sets an
 * HttpOnly, Secure, SameSite=Strict cookie that grants unlimited access.
 * The cookie name is configurable via OWNER_BYPASS_COOKIE_NAME env var.
 *
 * This endpoint does NOT require an authenticated Supabase session — it is
 * intentionally accessible without a session so the owner can unlock access
 * even when Google OAuth is not yet configured in a new environment.
 *
 * Security considerations:
 * - The ADMIN_BYPASS_KEY must be a strong random secret (≥32 chars).
 * - The cookie is HttpOnly so it cannot be read by JavaScript.
 * - The cookie is Secure so it is only sent over HTTPS.
 * - The cookie expires after 24 hours by default.
 * - Rate limiting should be applied at the CDN/edge layer in production.
 */
import { NextRequest, NextResponse } from "next/server";

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24; // 24 hours

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const providedKey: string | undefined = body?.key;

    const expectedKey = process.env.ADMIN_BYPASS_KEY;
    if (!expectedKey) {
      return NextResponse.json(
        { error: "ADMIN_BYPASS_KEY is not configured on this server." },
        { status: 503 }
      );
    }

    if (!providedKey || providedKey !== expectedKey) {
      // Constant-time comparison would be ideal here; for Next.js edge-compatible
      // environments we rely on the secret being long and random.
      return NextResponse.json({ error: "Invalid key." }, { status: 401 });
    }

    const cookieName =
      process.env.OWNER_BYPASS_COOKIE_NAME || "ai4u_owner_bypass";

    const response = NextResponse.json({
      ok: true,
      message: "Owner bypass cookie set. Unlimited access is now active for 24 hours.",
      expires_in_seconds: COOKIE_MAX_AGE_SECONDS,
    });

    response.cookies.set(cookieName, expectedKey, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: COOKIE_MAX_AGE_SECONDS,
      path: "/",
    });

    return response;
  } catch {
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/unlock
 *
 * Clears the owner bypass cookie.
 */
export async function DELETE(_req: NextRequest) {
  const cookieName =
    process.env.OWNER_BYPASS_COOKIE_NAME || "ai4u_owner_bypass";

  const response = NextResponse.json({
    ok: true,
    message: "Owner bypass cookie cleared.",
  });

  response.cookies.set(cookieName, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 0,
    path: "/",
  });

  return response;
}
