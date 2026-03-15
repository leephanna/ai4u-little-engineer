"use client";

import type { ValidationReport } from "@/lib/types";

interface ValidationBadgeProps {
  report: ValidationReport;
}

export function ValidationBadge({ report }: ValidationBadgeProps) {
  const score = report.printability_score ?? 0;
  const scorePercent = Math.round(score * 100);

  const scoreColor =
    score >= 0.8
      ? "text-green-400"
      : score >= 0.5
      ? "text-yellow-400"
      : "text-red-400";

  return (
    <div className="space-y-2">
      {/* Score row */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-steel-500">Printability</span>
          <span className={`text-sm font-bold ${scoreColor}`}>{scorePercent}%</span>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span
            className={`flex items-center gap-1 ${
              report.bounding_box_ok ? "text-green-400" : "text-red-400"
            }`}
          >
            {report.bounding_box_ok ? "✓" : "✗"} BBox
          </span>
          <span
            className={`flex items-center gap-1 ${
              report.wall_thickness_ok ? "text-green-400" : "text-red-400"
            }`}
          >
            {report.wall_thickness_ok ? "✓" : "✗"} Wall
          </span>
          <span
            className={`flex items-center gap-1 ${
              report.units_ok ? "text-green-400" : "text-red-400"
            }`}
          >
            {report.units_ok ? "✓" : "✗"} Units
          </span>
        </div>

        {report.bounding_box_mm && (
          <span className="text-xs text-steel-500 ml-auto">
            {report.bounding_box_mm.map((v) => v.toFixed(1)).join(" × ")} mm
          </span>
        )}
      </div>

      {/* Warnings */}
      {report.warnings && report.warnings.length > 0 && (
        <ul className="space-y-0.5">
          {report.warnings.map((w, i) => (
            <li key={i} className="text-yellow-400 text-xs flex gap-1.5">
              <span>⚠</span>
              <span>{w}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Errors */}
      {report.errors && report.errors.length > 0 && (
        <ul className="space-y-0.5">
          {report.errors.map((e, i) => (
            <li key={i} className="text-red-400 text-xs flex gap-1.5">
              <span>✗</span>
              <span>{e}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
