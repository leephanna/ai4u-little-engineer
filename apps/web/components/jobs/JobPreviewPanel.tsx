"use client";
/**
 * JobPreviewPanel
 *
 * Visual-proof pass: guarantees a visible preview for every successful CAD job
 * WITHOUT requiring the job to be saved to the Library first.
 *
 * Render chain (first available wins):
 *   1. Inline STL 3D viewer — uses the STL artifact already attached to the job
 *   2. PNG preview image  — if a png artifact exists (future CAD worker feature)
 *   3. Spec-based schematic — text summary of key dimensions when no binary artifact exists
 *
 * This component replaces <ProjectImageGallery projectId={jobId} …> on the job
 * detail page.  ProjectImageGallery (DALL-E images linked to the projects table)
 * is still available on the /projects library page once a job has been saved.
 */
import { useState } from "react";
import dynamic from "next/dynamic";
import type { Artifact, PartSpec } from "@/lib/types";

// Lazy-load the heavy Three.js viewer — same pattern as ArtifactList
const StlViewer = dynamic(
  () => import("@/components/StlViewer").then((m) => ({ default: m.StlViewer })),
  {
    ssr: false,
    loading: () => (
      <div className="w-full aspect-square max-h-80 bg-steel-900 rounded-xl animate-pulse flex items-center justify-center">
        <p className="text-steel-600 text-xs">Loading 3D viewer…</p>
      </div>
    ),
  }
);

interface JobPreviewPanelProps {
  artifacts: Artifact[];
  spec: PartSpec | null;
  jobTitle: string;
}

export function JobPreviewPanel({ artifacts, spec, jobTitle }: JobPreviewPanelProps) {
  const [viewerError, setViewerError] = useState(false);
  const [wireframe, setWireframe] = useState(false);

  // ── Tier 1: STL artifact ─────────────────────────────────────────────────
  const stlArtifact = artifacts.find((a) => a.kind === "stl");
  const pngArtifact = artifacts.find((a) => a.kind === "png");

  if (stlArtifact && !viewerError) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl overflow-hidden bg-steel-900 border border-steel-800">
          <StlViewer
            url={`/api/artifacts/${stlArtifact.id}/download`}
            width={600}
            height={400}
            className="w-full"
          />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-xs bg-indigo-900/30 text-indigo-300 border border-indigo-800 rounded px-2 py-0.5">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              3D Preview
            </span>
            <span className="text-xs text-steel-600">Click · drag · scroll to explore</span>
          </div>
          <button
            onClick={() => setWireframe((w) => !w)}
            className="text-xs text-steel-500 hover:text-steel-300 transition-colors"
          >
            {wireframe ? "Solid" : "Wireframe"}
          </button>
        </div>
        {/* Fallback trigger — shown if viewer silently fails */}
        <button
          onClick={() => setViewerError(true)}
          className="text-xs text-steel-700 hover:text-steel-500 transition-colors"
        >
          3D viewer not working? View spec summary →
        </button>
      </div>
    );
  }

  // ── Tier 2: PNG preview image ─────────────────────────────────────────────
  if (pngArtifact) {
    return (
      <div className="space-y-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/artifacts/${pngArtifact.id}/download`}
          alt={`Preview of ${jobTitle}`}
          className="w-full rounded-xl border border-steel-800 object-contain max-h-80 bg-steel-900"
        />
        <span className="inline-flex items-center gap-1 text-xs bg-steel-800 text-steel-400 border border-steel-700 rounded px-2 py-0.5">
          🖼️ Preview Image
        </span>
      </div>
    );
  }

  // ── Tier 3: Spec-based schematic (text fallback) ──────────────────────────
  if (spec) {
    const dims = (spec.dimensions_json ?? {}) as Record<string, unknown>;
    const dimEntries = Object.entries(dims).slice(0, 6);
    const family = spec.family?.replace(/_/g, " ") ?? "part";
    const material = (spec as PartSpec & { material?: string }).material ?? "PLA";

    return (
      <div className="rounded-xl bg-steel-800 border border-steel-700 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl">📐</span>
          <div>
            <p className="text-steel-200 font-medium text-sm capitalize">{family}</p>
            <p className="text-steel-500 text-xs">Spec-based schematic — 3D file generating</p>
          </div>
        </div>

        {dimEntries.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {dimEntries.map(([key, val]) => (
              <div key={key} className="bg-steel-900/60 rounded-lg px-3 py-2">
                <p className="text-steel-500 text-xs capitalize">{key.replace(/_/g, " ")}</p>
                <p className="text-steel-200 text-sm font-mono font-semibold">
                  {typeof val === "number" ? `${val} ${spec.units ?? "mm"}` : String(val ?? "—")}
                </p>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-3 text-xs text-steel-500">
          <span>🧵 {material}</span>
          {spec.units && <span>📏 {spec.units}</span>}
          <span>v{spec.version}</span>
        </div>
      </div>
    );
  }

  // ── No artifacts and no spec ──────────────────────────────────────────────
  return (
    <div className="rounded-xl bg-steel-800 border border-steel-700 border-dashed aspect-square max-h-80 flex flex-col items-center justify-center gap-3">
      <div className="text-4xl opacity-30">🖨️</div>
      <p className="text-steel-500 text-sm text-center px-4">
        No preview available yet. The 3D model will appear here once generation completes.
      </p>
    </div>
  );
}
