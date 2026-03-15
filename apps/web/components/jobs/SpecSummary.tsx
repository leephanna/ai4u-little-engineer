"use client";

import type { PartSpec } from "@/lib/types";

interface SpecSummaryProps {
  spec: PartSpec;
}

export function SpecSummary({ spec }: SpecSummaryProps) {
  const dims = spec.dimensions_json ?? {};
  const assumptions = spec.assumptions_json ?? [];
  const missing = spec.missing_fields_json ?? [];

  return (
    <div className="card space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <span className="font-semibold text-steel-100 capitalize">
            {spec.family.replace(/_/g, " ")}
          </span>
          {spec.material && (
            <span className="ml-2 text-xs text-steel-400 bg-steel-700 px-2 py-0.5 rounded-full">
              {spec.material}
            </span>
          )}
        </div>
        <span className="text-xs text-steel-500 uppercase">{spec.units}</span>
      </div>

      {/* Dimensions table */}
      {Object.keys(dims).length > 0 && (
        <div>
          <p className="text-xs text-steel-500 uppercase tracking-wide mb-2">Dimensions</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {Object.entries(dims).map(([key, val]) => (
              <div key={key} className="flex justify-between text-sm">
                <span className="text-steel-400 capitalize">{key.replace(/_/g, " ")}</span>
                <span className="text-steel-200 font-mono">
                  {typeof val === "number" ? val.toFixed(2) : val} {spec.units}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Missing fields warning */}
      {missing.length > 0 && (
        <div className="bg-yellow-900/30 border border-yellow-800 rounded-lg px-3 py-2">
          <p className="text-yellow-300 text-xs font-medium mb-1">Missing fields</p>
          <ul className="text-yellow-400 text-xs space-y-0.5">
            {missing.map((f) => (
              <li key={f}>• {f.replace(/_/g, " ")}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Assumptions */}
      {assumptions.length > 0 && (
        <div>
          <p className="text-xs text-steel-500 uppercase tracking-wide mb-1.5">Assumptions</p>
          <ul className="space-y-1">
            {assumptions.map((a, i) => (
              <li key={i} className="text-steel-400 text-xs flex gap-2">
                <span className="text-brand-500 flex-shrink-0">→</span>
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
