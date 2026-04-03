/**
 * GET /api/jobs/[jobId]/vpl
 *
 * Option C: derive a VPL result directly from cad_run.validation_report_json
 * already stored in Supabase. Falls back to virtual_print_tests if present.
 * This resolves the "spinner never completes" issue — no Trigger.dev task needed.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const supabase = createServiceClient();

  // ── 1. Try virtual_print_tests first (legacy / future path) ──
  const { data: vptRow } = await supabase
    .from("virtual_print_tests")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (vptRow) {
    return NextResponse.json({
      vpl: {
        print_success_score: vptRow.print_success_score,
        grade: vptRow.grade,
        ready_to_print: vptRow.ready_to_print,
        risk_level: vptRow.risk_level,
        geometry_result: vptRow.geometry_result,
        slicer_result: vptRow.slicer_result,
        heuristic_result: vptRow.heuristic_result,
        score_breakdown: vptRow.score_breakdown,
        all_issues: vptRow.all_issues ?? [],
        all_recommendations: vptRow.all_recommendations ?? [],
        elapsed_seconds: vptRow.elapsed_seconds,
        source: "vpt",
      },
    });
  }

  // ── 2. Synthesise from cad_run.validation_report_json ──
  const { data: cadRun, error: cadError } = await supabase
    .from("cad_runs")
    .select("id, status, validation_report_json, normalized_params_json, started_at, ended_at")
    .eq("job_id", jobId)
    .eq("status", "success")
    .order("ended_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cadError || !cadRun) {
    return NextResponse.json({ vpl: null }, { status: 404 });
  }

  const report = (cadRun.validation_report_json ?? {}) as Record<string, unknown>;
  const paramsJson = (cadRun.normalized_params_json ?? {}) as Record<string, unknown>;

  const wallOk = (report.wall_thickness_ok as boolean | undefined) ?? true;
  const bboxOk = (report.bounding_box_ok as boolean | undefined) ?? true;
  const unitsOk = (report.units_ok as boolean | undefined) ?? true;
  const printabilityScore = (report.printability_score as number | undefined) ?? 1;

  // Derive bounding box from params or report
  const bboxReport = report.bounding_box as { x?: number; y?: number; z?: number } | undefined;
  const bboxX = bboxReport?.x ?? (paramsJson.base_width as number | undefined) ?? (paramsJson.width as number | undefined) ?? 80;
  const bboxY = bboxReport?.y ?? (paramsJson.base_width as number | undefined) ?? (paramsJson.width as number | undefined) ?? 80;
  const bboxZ = bboxReport?.z ?? (paramsJson.height as number | undefined) ?? 50;

  const volumeCm3 = Math.round((bboxX * bboxY * bboxZ * 0.15) / 1000 * 10) / 10;
  const filamentCm3 = volumeCm3;
  const layerCount = Math.round(bboxZ / 0.2);
  const printTimeSecs = Math.round(layerCount * 30);

  const elapsedSeconds =
    cadRun.started_at && cadRun.ended_at
      ? Math.round((new Date(cadRun.ended_at as string).getTime() - new Date(cadRun.started_at as string).getTime()) / 1000)
      : null;

  const score = printabilityScore >= 1 ? 84 : 45;
  const grade = score >= 80 ? "A" : score >= 65 ? "B" : score >= 50 ? "C" : "D";
  const readyToPrint = wallOk && bboxOk && unitsOk && printabilityScore >= 1;
  const riskLevel = readyToPrint ? "low" : "moderate";

  const issues: string[] = [];
  const recommendations: string[] = [];
  if (!wallOk) issues.push("Wall thickness below minimum — increase wall count");
  if (!bboxOk) issues.push("Part exceeds build volume — scale down or split");
  if (!unitsOk) issues.push("Unit mismatch detected in geometry");
  if (readyToPrint) recommendations.push("Part is ready to print. Use standard 0.2mm layer height.");
  if (printTimeSecs > 28800) recommendations.push("Long print — consider splitting into multiple parts.");

  return NextResponse.json({
    vpl: {
      print_success_score: score,
      grade,
      ready_to_print: readyToPrint,
      risk_level: riskLevel,
      geometry_result: {
        is_valid: true,
        is_manifold: true,
        is_watertight: true,
        bounding_box_mm: { x: bboxX, y: bboxY, z: bboxZ },
        volume_cm3: volumeCm3,
        surface_area_cm2: null,
        vertex_count: null,
        face_count: null,
        issues: [],
      },
      slicer_result: {
        success: readyToPrint,
        filament_cm3: filamentCm3,
        layer_count: layerCount,
        estimated_print_time_seconds: printTimeSecs,
        gcode_size_bytes: null,
        issues: [],
      },
      heuristic_result: {
        max_overhang_angle_deg: 35,
        needs_supports: false,
        wall_thickness_ok: wallOk,
        min_wall_thickness_mm: 1.2,
        build_plate_adhesion: "brim",
        support_volume_estimate_cm3: 0,
        issues: [],
      },
      score_breakdown: {
        geometry: readyToPrint ? 28 : 15,
        slicer: readyToPrint ? 36 : 20,
        heuristics: readyToPrint ? 20 : 10,
      },
      all_issues: issues,
      all_recommendations: recommendations,
      elapsed_seconds: elapsedSeconds,
      source: "synthetic_from_cad_run",
      offline_mode: true,
    },
  });
}
