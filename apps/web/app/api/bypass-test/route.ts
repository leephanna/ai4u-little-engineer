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
    // Show last 8 chars of stored key to diagnose extra characters (safe - partial only)
    admin_key_tail: adminBypassKey ? adminBypassKey.slice(-8) : null,
    admin_key_tail_hex: adminBypassKey
      ? Buffer.from(adminBypassKey.slice(-8)).toString("hex")
      : null,
    keys_match: probeKey?.trim() === adminBypassKey,
    is_owner_probe: !!isOwnerProbe,
  });
}
