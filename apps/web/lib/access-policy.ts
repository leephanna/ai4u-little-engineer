/**
 * Centralized Access Policy Module
 *
 * Provides a single source of truth for access decisions, quota bypasses,
 * and owner-unlimited testing.
 *
 * Policy priority order:
 * 1. Authenticated owner email
 * 2. Secure owner bypass cookie
 * 3. Admin bypass header
 * 4. Preview unlimited (if enabled in env)
 * 5. Normal plan/quota logic (handled by caller if shouldBypassLimits returns false)
 */

import { cookies, headers } from "next/headers";

/**
 * Helper to parse comma-separated env vars into a clean array.
 */
function csvToList(csv: string | undefined): string[] {
  if (!csv) return [];
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Normalize email for comparison.
 */
function normalizeEmail(email: string | undefined | null): string {
  if (!email) return "";
  return email.trim().toLowerCase();
}

/**
 * Check if the given email belongs to an owner.
 */
export function isOwnerEmail(email: string | undefined | null): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;

  const ownerEmails = csvToList(process.env.OWNER_EMAILS);
  // Hardcode the primary owner as a fallback if env var is missing
  if (ownerEmails.length === 0) {
    ownerEmails.push("leehanna8@gmail.com");
  }

  return ownerEmails.some((owner) => normalizeEmail(owner) === normalized);
}

/**
 * Check if preview unlimited mode is active.
 */
export function isPreviewUnlimited(): boolean {
  return process.env.PREVIEW_UNLIMITED === "true";
}

/**
 * Check if the request has a valid admin bypass header.
 */
export async function hasAdminBypassKey(): Promise<boolean> {
  const headersList = await headers();
  const key = headersList.get("x-admin-bypass-key");
  const expectedKey = process.env.ADMIN_BYPASS_KEY;

  if (!key || !expectedKey) return false;
  return key === expectedKey;
}

/**
 * Check if the request has a valid owner bypass cookie.
 */
export async function hasOwnerBypassCookie(): Promise<boolean> {
  const cookieStore = await cookies();
  const cookieName = process.env.OWNER_BYPASS_COOKIE_NAME || "ai4u_owner_bypass";
  const cookie = cookieStore.get(cookieName);

  if (!cookie?.value) return false;

  // In a real app, this value should be a signed JWT or cryptographically
  // verified token. For this fallback flow, we verify it matches the admin key.
  const expectedKey = process.env.ADMIN_BYPASS_KEY;
  if (!expectedKey) return false;

  return cookie.value === expectedKey;
}

export interface BypassResult {
  bypassed: boolean;
  reason: string | null;
}

/**
 * Master function to determine if the current request should bypass
 * normal quota and plan limits.
 *
 * @param userEmail The authenticated user's email, if available.
 */
export async function shouldBypassLimits(
  userEmail?: string | null
): Promise<BypassResult> {
  // 1. Authenticated owner email
  if (isOwnerEmail(userEmail)) {
    return { bypassed: true, reason: "owner_email" };
  }

  // 2. Secure owner bypass cookie
  if (await hasOwnerBypassCookie()) {
    return { bypassed: true, reason: "owner_cookie" };
  }

  // 3. Admin bypass header
  if (await hasAdminBypassKey()) {
    return { bypassed: true, reason: "admin_header" };
  }

  // 4. Preview unlimited
  if (isPreviewUnlimited()) {
    return { bypassed: true, reason: "preview_unlimited" };
  }

  // 5. Normal limits apply
  return { bypassed: false, reason: null };
}
