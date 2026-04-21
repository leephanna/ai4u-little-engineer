/**
 * GET /api/bypass-test
 * Temporary diagnostic endpoint — safe to be public (no secrets exposed).
 * Returns key comparison metadata to diagnose admin bypass key issues.
 */
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const probeKey = request.headers.get("x-admin-bypass-key");
  const adminBypassKey = process.env.ADMIN_BYPASS_KEY?.trim();
  const isOwnerProbe = adminBypassKey && probeKey?.trim() === adminBypassKey;

  return NextResponse.json({
    probe_key_received: probeKey
      ? `${probeKey.slice(0, 4)}...${probeKey.slice(-4)}`
      : null,
    probe_key_length: probeKey?.length ?? 0,
    admin_key_set: !!adminBypassKey,
    admin_key_length: adminBypassKey?.length ?? 0,
    keys_match: probeKey === adminBypassKey,
    is_owner_probe: !!isOwnerProbe,
  });
}
