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
 *
 * CANONICAL FAMILY DECISION (documented here):
 *   cube/block prompts  → solid_block  (NO HOLE — true solid rectangular block)
 *   standoff prompts    → standoff_block (requires hole, base_width + height)
 *   cylinder prompts    → spacer (outer_diameter + length, inner_diameter=0 for solid)
 *   ring/spacer prompts → spacer (outer_diameter + inner_diameter + length)
 *
 * cube != standoff_block. A cube must not require a hole.
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

  // ── Normalizer test cases ──────────────────────────────────────────────────
  // IMPORTANT: cube MUST route to solid_block (NOT standoff_block).
  // solid_block has no hole requirement. standoff_block requires hole_diameter >= 1.5mm.

  const cubeResult = tryNormalizePrimitive(
    "Make a cube with 5mm sides. Don't ask for clarification. Just make a cube."
  );
  const cube5mmResult = tryNormalizePrimitive("5mm cube");
  const solidCubeResult = tryNormalizePrimitive("make a 20mm solid cube");
  const cylinderResult = tryNormalizePrimitive("make a cylinder 20mm diameter 30mm tall");
  const standoffResult = tryNormalizePrimitive("make a standoff 20mm tall with a 3mm hole");
  const ringResult = tryNormalizePrimitive("make a ring 30mm od 10mm id 5mm thick");
  const noMatchResult = tryNormalizePrimitive("make a bracket to hold my monitor");

  const normalizerTests = {
    // Journey A test case — cube must go to solid_block, NO hole
    cube_journey_a: {
      input: "Make a cube with 5mm sides. Don't ask for clarification. Just make a cube.",
      expected_family: "solid_block",
      expected_no_hole: true,
      got_family: cubeResult?.family ?? null,
      got_params: cubeResult?.parameters ?? null,
      pass:
        cubeResult?.family === "solid_block" &&
        cubeResult?.parameters?.length === 5 &&
        cubeResult?.parameters?.width === 5 &&
        cubeResult?.parameters?.height === 5 &&
        !("hole_diameter" in (cubeResult?.parameters ?? {})),
    },
    cube_5mm: {
      input: "5mm cube",
      expected_family: "solid_block",
      expected_no_hole: true,
      got_family: cube5mmResult?.family ?? null,
      got_params: cube5mmResult?.parameters ?? null,
      pass:
        cube5mmResult?.family === "solid_block" &&
        !("hole_diameter" in (cube5mmResult?.parameters ?? {})),
    },
    solid_cube_20mm: {
      input: "make a 20mm solid cube",
      expected_family: "solid_block",
      expected_no_hole: true,
      got_family: solidCubeResult?.family ?? null,
      got_params: solidCubeResult?.parameters ?? null,
      pass:
        solidCubeResult?.family === "solid_block" &&
        !("hole_diameter" in (solidCubeResult?.parameters ?? {})),
    },
    cylinder: {
      input: "make a cylinder 20mm diameter 30mm tall",
      expected_family: "spacer",
      expected_no_hole: false,
      got_family: cylinderResult?.family ?? null,
      got_params: cylinderResult?.parameters ?? null,
      pass:
        cylinderResult?.family === "spacer" &&
        cylinderResult?.parameters?.outer_diameter === 20 &&
        cylinderResult?.parameters?.inner_diameter === 0 &&
        cylinderResult?.parameters?.length === 30,
    },
    standoff_explicit: {
      input: "make a standoff 20mm tall with a 3mm hole",
      expected_family: "standoff_block",
      expected_no_hole: false,
      got_family: standoffResult?.family ?? null,
      got_params: standoffResult?.parameters ?? null,
      pass: standoffResult?.family === "standoff_block",
    },
    ring: {
      input: "make a ring 30mm od 10mm id 5mm thick",
      expected_family: "spacer",
      expected_no_hole: false,
      got_family: ringResult?.family ?? null,
      got_params: ringResult?.parameters ?? null,
      pass:
        ringResult?.family === "spacer" &&
        ringResult?.parameters?.outer_diameter === 30 &&
        ringResult?.parameters?.inner_diameter === 10,
    },
    no_match_bracket: {
      input: "make a bracket to hold my monitor",
      expected_family: null,
      expected_no_hole: false,
      got_family: noMatchResult?.family ?? null,
      pass: noMatchResult === null,
    },
  };

  const allNormalizerPass = Object.values(normalizerTests).every((t) => t.pass);
  const passCount = Object.values(normalizerTests).filter((t) => t.pass).length;
  const totalCount = Object.keys(normalizerTests).length;

  return NextResponse.json(
    {
      status: allNormalizerPass ? "ALL_PASS" : "SOME_FAIL",
      timestamp: new Date().toISOString(),
      deployment: {
        commit_sha: COMMIT_SHA,
        deployment_id: DEPLOYMENT_ID,
        vercel_env: VERCEL_ENV,
        vercel_region: VERCEL_REGION,
      },
      canonical_family_decision: {
        cube_routes_to: "solid_block",
        cube_has_hole: false,
        standoff_routes_to: "standoff_block",
        standoff_requires_hole: true,
        spacer_routes_to: "spacer",
        note: "cube != standoff_block. solid_block is a true solid rectangular block with no hole requirement. A cube must not be forced into standoff_block.",
      },
      normalizer: {
        module: "apps/web/lib/primitive-normalizer.ts",
        imported: true,
        all_tests_pass: allNormalizerPass,
        pass_count: passCount,
        total_count: totalCount,
        tests: normalizerTests,
      },
      routes: {
        interpret: "apps/web/app/api/intake/interpret/route.ts",
        invent: "apps/web/app/api/invent/route.ts",
        artemis: "apps/web/app/api/demo/artemis/route.ts",
        probe: "apps/web/app/api/probe/route.ts",
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
    },
    {
      headers: {
        "x-commit-sha": COMMIT_SHA,
        "x-deployment-id": DEPLOYMENT_ID,
        "x-all-tests-pass": String(allNormalizerPass),
        "Cache-Control": "no-store",
      },
    }
  );
}
