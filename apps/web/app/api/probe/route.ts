/**
 * GET /api/probe
 *
 * Owner-only production proof endpoint.
 * Returns live deployment info, commit SHA, and normalizer status.
 * Requires X-Admin-Bypass-Key header matching ADMIN_BYPASS_KEY env var.
 *
 * This endpoint is SAFE to be public-facing:
 * - It does NOT return any secrets or env var values
 * - It only returns metadata about the running deployment
 * - The bypass key is required to prevent abuse
 */

import { NextRequest, NextResponse } from "next/server";
import { tryNormalizePrimitive } from "@/lib/primitive-normalizer";

const COMMIT_SHA = process.env.VERCEL_GIT_COMMIT_SHA ?? "local";
const DEPLOYMENT_ID = process.env.VERCEL_DEPLOYMENT_ID ?? "local";
const VERCEL_ENV = process.env.VERCEL_ENV ?? "development";
const VERCEL_REGION = process.env.VERCEL_REGION ?? "local";

export async function GET(req: NextRequest) {
  const probeKey = req.headers.get("x-admin-bypass-key");
  const adminBypassKey = process.env.ADMIN_BYPASS_KEY;

  if (!adminBypassKey || probeKey !== adminBypassKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Test the primitive normalizer inline
  const cubeResult = tryNormalizePrimitive("make a cube with 5mm sides");
  const cylinderResult = tryNormalizePrimitive("make a cylinder 20mm diameter 30mm tall");
  const ringResult = tryNormalizePrimitive("make a ring 30mm od 10mm id 5mm thick");
  const noMatchResult = tryNormalizePrimitive("make a bracket to hold my monitor");

  const normalizerTests = {
    cube_5mm: {
      input: "make a cube with 5mm sides",
      expected_family: "standoff_block",
      got_family: cubeResult?.family ?? null,
      got_params: cubeResult?.parameters ?? null,
      pass: cubeResult?.family === "standoff_block" &&
            cubeResult?.parameters?.length === 5 &&
            cubeResult?.parameters?.width === 5 &&
            cubeResult?.parameters?.height === 5 &&
            cubeResult?.parameters?.hole_diameter === 0,
    },
    cylinder: {
      input: "make a cylinder 20mm diameter 30mm tall",
      expected_family: "spacer",
      got_family: cylinderResult?.family ?? null,
      got_params: cylinderResult?.parameters ?? null,
      pass: cylinderResult?.family === "spacer" &&
            cylinderResult?.parameters?.outer_diameter === 20 &&
            cylinderResult?.parameters?.inner_diameter === 0 &&
            cylinderResult?.parameters?.length === 30,
    },
    ring: {
      input: "make a ring 30mm od 10mm id 5mm thick",
      expected_family: "spacer",
      got_family: ringResult?.family ?? null,
      got_params: ringResult?.parameters ?? null,
      pass: ringResult?.family === "spacer" &&
            ringResult?.parameters?.outer_diameter === 30 &&
            ringResult?.parameters?.inner_diameter === 10,
    },
    no_match: {
      input: "make a bracket to hold my monitor",
      expected_family: null,
      got_family: noMatchResult?.family ?? null,
      pass: noMatchResult === null,
    },
  };

  const allNormalizerPass = Object.values(normalizerTests).every((t) => t.pass);

  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    deployment: {
      commit_sha: COMMIT_SHA,
      deployment_id: DEPLOYMENT_ID,
      vercel_env: VERCEL_ENV,
      vercel_region: VERCEL_REGION,
    },
    routes: {
      interpret: "apps/web/app/api/intake/interpret/route.ts",
      invent: "apps/web/app/api/invent/route.ts",
      artemis: "apps/web/app/api/demo/artemis/route.ts",
      probe: "apps/web/app/api/probe/route.ts",
    },
    normalizer: {
      module: "apps/web/lib/primitive-normalizer.ts",
      imported: true,
      all_tests_pass: allNormalizerPass,
      tests: normalizerTests,
    },
    gallery: {
      spec_param: "?spec=<base64-encoded-JSON>",
      invent_page: "apps/web/app/invent/page.tsx",
      gallery_page: "apps/web/app/gallery/page.tsx",
      flow: "gallery → /invent?spec=<base64> → initialLockedSpec → skip interpret → generate",
    },
    truth_states: {
      states: [
        "spec_ready_no_run",
        "run_in_progress",
        "run_failed",
        "run_success_no_preview",
        "preview_available",
      ],
      job_detail_page: "apps/web/app/jobs/[id]/page.tsx",
    },
  });
}
