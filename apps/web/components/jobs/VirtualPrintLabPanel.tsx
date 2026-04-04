"use client";
/**
 * VirtualPrintLabPanel
 *
 * Displays VPL analysis results for a completed CAD run.
 *
 * Field-name alignment (visual-proof pass):
 *   - GeometryResult: triangle_count → face_count | null (API uses face_count)
 *   - SlicerResult: print_time_minutes → derived from estimated_print_time_seconds
 *   - All nullable numeric fields guarded before .toFixed() / .toLocaleString()
 */
import { useEffect, useState } from "react";

interface GeometryResult {
  is_watertight: boolean;
  is_valid: boolean;
  volume_cm3: number | null;
  surface_area_cm2: number | null;
  bounding_box_mm: { x: number; y: number; z: number } | null;
  /** API may return face_count or triangle_count depending on source */
  triangle_count?: number | null;
  face_count?: number | null;
  vertex_count?: number | null;
  issues: string[];
  score?: number | null;
}

interface SlicerResult {
  success: boolean;
  /** Legacy field — present when VPL data comes from virtual_print_tests */
  print_time_minutes?: number | null;
  /** Synthesised field — present when VPL is derived from cad_run */
  estimated_print_time_seconds?: number | null;
  filament_mm?: number | null;
  filament_cm3?: number | null;
  layer_count?: number | null;
  issues: string[];
  score?: number | null;
}

interface HeuristicResult {
  max_overhang_angle_deg: number | null;
  needs_supports: boolean;
  estimated_support_volume_pct?: number | null;
  wall_thickness_ok: boolean;
  min_wall_thickness_mm: number | null;
  build_plate_adhesion: string | null;
  issues: string[];
  recommendations?: string[];
  score?: number | null;
}

interface ScoreBreakdown {
  geometry: number;
  slicer: number;
  heuristics: number;
  total?: number | null;
}

interface VPLResult {
  print_success_score: number;
  grade: string;
  ready_to_print: boolean;
  risk_level: string;
  geometry_result: GeometryResult;
  slicer_result: SlicerResult;
  heuristic_result: HeuristicResult;
  score_breakdown: ScoreBreakdown;
  all_issues: string[];
  all_recommendations: string[];
  elapsed_seconds?: number | null;
  source?: string;
}

interface VirtualPrintLabPanelProps {
  jobId: string;
  cadRunId: string;
}

const GRADE_COLORS: Record<string, string> = {
  A: "bg-green-100 text-green-800 border-green-200",
  B: "bg-blue-100 text-blue-800 border-blue-200",
  C: "bg-yellow-100 text-yellow-800 border-yellow-200",
  D: "bg-orange-100 text-orange-800 border-orange-200",
  F: "bg-red-100 text-red-800 border-red-200",
};

const RISK_COLORS: Record<string, string> = {
  low: "text-green-700",
  medium: "text-yellow-700",
  moderate: "text-yellow-700",
  high: "text-orange-700",
  critical: "text-red-700",
};

function ScoreBar({ score, max, label }: { score: number; max: number; label: string }) {
  const pct = Math.round((score / max) * 100);
  const color = pct >= 80 ? "bg-green-500" : pct >= 60 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-gray-600">
        <span>{label}</span>
        <span>{score}/{max}</span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Derive print time in minutes from either legacy or synthesised field */
function getPrintTimeMinutes(slicer: SlicerResult): number | null {
  if (slicer.print_time_minutes != null) return slicer.print_time_minutes;
  if (slicer.estimated_print_time_seconds != null) return slicer.estimated_print_time_seconds / 60;
  return null;
}

/** Format print time for display */
function formatPrintTime(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/** Get triangle/face count from geometry result (field name varies by source) */
function getTriangleCount(geo: GeometryResult): number | null {
  return geo.triangle_count ?? geo.face_count ?? null;
}

export function VirtualPrintLabPanel({ jobId, cadRunId }: VirtualPrintLabPanelProps) {
  const [vplData, setVplData] = useState<VPLResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let retries = 0;
    const MAX_RETRIES = 8; // ~2 min total polling

    async function fetchVPL() {
      try {
        const res = await fetch(`/api/jobs/${jobId}/vpl`);
        if (cancelled) return;

        if (res.status === 404) {
          if (retries < MAX_RETRIES) {
            retries++;
            setRetryCount(retries);
            setTimeout(fetchVPL, 15_000);
          } else {
            // Give up after MAX_RETRIES
            setLoading(false);
          }
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as { vpl: VPLResult | null };
        if (data.vpl) {
          setVplData(data.vpl);
          setLoading(false);
        } else {
          if (retries < MAX_RETRIES) {
            retries++;
            setRetryCount(retries);
            setTimeout(fetchVPL, 10_000);
          } else {
            setLoading(false);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(String(err));
          setLoading(false);
        }
      }
    }
    void fetchVPL();
    return () => { cancelled = true; };
  }, [jobId, cadRunId]);

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
          <div>
            <p className="font-medium text-gray-700">Virtual Print Lab</p>
            <p className="text-sm text-gray-500">
              {retryCount > 0
                ? `Running geometry validation… (check ${retryCount})`
                : "Running geometry validation and slicer simulation…"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !vplData) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <p className="text-sm text-gray-500">Virtual Print Lab analysis unavailable.</p>
      </div>
    );
  }

  const gradeColor = GRADE_COLORS[vplData.grade] ?? "bg-gray-100 text-gray-800 border-gray-200";
  const riskColor = RISK_COLORS[vplData.risk_level] ?? "text-gray-700";
  const geo = vplData.geometry_result;
  const slicer = vplData.slicer_result;
  const heuristic = vplData.heuristic_result;
  const printTimeMinutes = getPrintTimeMinutes(slicer);
  const triangleCount = getTriangleCount(geo);

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <span className="text-lg">🧪</span>
          <div>
            <p className="font-semibold text-gray-900">Virtual Print Lab</p>
            <p className="text-xs text-gray-500">Geometry · Slicer · Heuristics</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Grade badge */}
          <span className={`text-2xl font-bold px-3 py-1 rounded-lg border ${gradeColor}`}>
            {vplData.grade}
          </span>
          {/* Score */}
          <div className="text-right">
            <p className="text-2xl font-bold text-gray-900">{vplData.print_success_score}</p>
            <p className="text-xs text-gray-500">/ 100</p>
          </div>
        </div>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100">
        <div className="p-3 text-center">
          <p className={`text-sm font-semibold ${vplData.ready_to_print ? "text-green-700" : "text-red-700"}`}>
            {vplData.ready_to_print ? "✓ Ready to Print" : "✗ Not Ready"}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">Print Status</p>
        </div>
        <div className="p-3 text-center">
          <p className={`text-sm font-semibold capitalize ${riskColor}`}>{vplData.risk_level} Risk</p>
          <p className="text-xs text-gray-500 mt-0.5">Risk Level</p>
        </div>
        <div className="p-3 text-center">
          <p className="text-sm font-semibold text-gray-700">
            {printTimeMinutes != null ? formatPrintTime(printTimeMinutes) : "—"}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">Est. Print Time</p>
        </div>
      </div>

      {/* Score breakdown */}
      <div className="p-4 space-y-2 border-b border-gray-100">
        <ScoreBar score={vplData.score_breakdown.geometry} max={30} label="Geometry" />
        <ScoreBar score={vplData.score_breakdown.slicer} max={40} label="Slicer" />
        <ScoreBar score={vplData.score_breakdown.heuristics} max={30} label="Heuristics" />
      </div>

      {/* Issues */}
      {vplData.all_issues.length > 0 && (
        <div className="p-4 border-b border-gray-100">
          <p className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-2">Issues</p>
          <ul className="space-y-1">
            {vplData.all_issues.map((issue, i) => (
              <li key={i} className="text-sm text-red-600 flex items-start gap-1.5">
                <span className="mt-0.5 shrink-0">⚠</span>
                <span>{issue}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recommendations */}
      {vplData.all_recommendations.length > 0 && (
        <div className="p-4 border-b border-gray-100">
          <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">Recommendations</p>
          <ul className="space-y-1">
            {vplData.all_recommendations.map((rec, i) => (
              <li key={i} className="text-sm text-blue-600 flex items-start gap-1.5">
                <span className="mt-0.5 shrink-0">→</span>
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Expandable details */}
      <div className="p-4">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
        >
          {expanded ? "▲ Hide details" : "▼ Show full analysis"}
        </button>

        {expanded && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            {/* Geometry */}
            <div className="space-y-1">
              <p className="font-semibold text-gray-700">Geometry</p>
              <p className="text-gray-600">Watertight: {geo.is_watertight ? "✓" : "✗"}</p>
              <p className="text-gray-600">Valid: {geo.is_valid ? "✓" : "✗"}</p>
              {geo.volume_cm3 != null && (
                <p className="text-gray-600">Volume: {geo.volume_cm3.toFixed(2)} cm³</p>
              )}
              {triangleCount != null && (
                <p className="text-gray-600">Triangles: {triangleCount.toLocaleString()}</p>
              )}
              {geo.bounding_box_mm != null && (
                <p className="text-gray-600">
                  Bounds: {geo.bounding_box_mm.x.toFixed(1)} × {geo.bounding_box_mm.y.toFixed(1)} × {geo.bounding_box_mm.z.toFixed(1)} mm
                </p>
              )}
            </div>
            {/* Slicer */}
            <div className="space-y-1">
              <p className="font-semibold text-gray-700">Slicer</p>
              <p className="text-gray-600">Status: {slicer.success ? "✓ Success" : "✗ Failed"}</p>
              {slicer.filament_cm3 != null && (
                <p className="text-gray-600">Filament: {slicer.filament_cm3.toFixed(2)} cm³</p>
              )}
              {slicer.layer_count != null && (
                <p className="text-gray-600">Layers: {slicer.layer_count.toLocaleString()}</p>
              )}
              {printTimeMinutes != null && (
                <p className="text-gray-600">Print time: {formatPrintTime(printTimeMinutes)}</p>
              )}
            </div>
            {/* Heuristics */}
            <div className="space-y-1">
              <p className="font-semibold text-gray-700">Heuristics</p>
              {heuristic.max_overhang_angle_deg != null && (
                <p className="text-gray-600">Overhang: {heuristic.max_overhang_angle_deg.toFixed(0)}°</p>
              )}
              <p className="text-gray-600">Supports: {heuristic.needs_supports ? "Required" : "Not needed"}</p>
              <p className="text-gray-600">Wall OK: {heuristic.wall_thickness_ok ? "✓" : "✗"}</p>
              {heuristic.min_wall_thickness_mm != null && (
                <p className="text-gray-600">Min wall: {heuristic.min_wall_thickness_mm.toFixed(1)} mm</p>
              )}
              {heuristic.build_plate_adhesion && (
                <p className="text-gray-600">Adhesion: {heuristic.build_plate_adhesion}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
