/**
 * lib/auth.ts — Clerk Auth Helper
 *
 * Provides a unified interface for getting the authenticated user in
 * Next.js Server Components and API routes.
 *
 * Replaces the legacy `supabase.auth.getUser()` pattern.
 *
 * Usage in API routes:
 *   const user = await getAuthUser();
 *   if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 *   // user.id is the Clerk userId (e.g. "user_2abc123")
 *   // user.email is the user's primary email address
 */
import { auth, currentUser } from "@clerk/nextjs/server";

export interface AuthUser {
  /** Clerk user ID — use this as clerk_user_id in DB queries */
  id: string;
  /** Primary email address */
  email: string | null;
}

/**
 * Get the authenticated user from Clerk.
 * Returns null if the user is not authenticated.
 *
 * This is the drop-in replacement for:
 *   const { data: { user }, error } = await supabase.auth.getUser();
 */
export async function getAuthUser(): Promise<AuthUser | null> {
  const { userId } = auth();
  if (!userId) return null;

  try {
    const user = await currentUser();
    if (!user) return null;

    const primaryEmail =
      user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)
        ?.emailAddress ??
      user.emailAddresses[0]?.emailAddress ??
      null;

    return {
      id: userId,
      email: primaryEmail,
    };
  } catch {
    // If currentUser() fails (e.g. in edge runtime), fall back to just userId
    return { id: userId, email: null };
  }
}

/**
 * Assert that the user is authenticated and return the user object.
 * Throws a 401 response if not authenticated.
 *
 * Usage:
 *   const user = await requireAuthUser();
 */
export async function requireAuthUser(): Promise<AuthUser> {
  const user = await getAuthUser();
  if (!user) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return user;
}
