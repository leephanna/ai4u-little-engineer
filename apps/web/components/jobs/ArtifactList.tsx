"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { Artifact } from "@/lib/types";

// Lazy-load the heavy Three.js viewer only when needed
const StlViewer = dynamic(
  () => import("@/components/StlViewer").then((m) => ({ default: m.StlViewer })),
  { ssr: false, loading: () => <div className="w-full h-64 bg-steel-900 rounded-xl animate-pulse" /> }
);

const KIND_ICONS: Record<string, string> = {
  step: "📐",
  stl: "🖨️",
  png: "🖼️",
  json_receipt: "📋",
  transcript: "💬",
  prompt: "🤖",
  log: "📄",
};

const KIND_LABELS: Record<string, string> = {
  step: "STEP File",
  stl: "STL File",
  png: "Preview Image",
  json_receipt: "Receipt JSON",
  transcript: "Transcript",
  prompt: "Prompt Log",
  log: "Run Log",
};

function formatBytes(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface ArtifactListProps {
  artifacts: Artifact[];
  jobId: string;
}

export function ArtifactList({ artifacts, jobId: _jobId }: ArtifactListProps) {
  const [expandedStl, setExpandedStl] = useState<string | null>(null);

  if (artifacts.length === 0) {
    return (
      <div className="card text-steel-400 text-sm text-center py-6">
        No artifacts yet.
      </div>
    );
  }

  // Sort: STL first, then STEP, then others
  const sorted = [...artifacts].sort((a, b) => {
    const order = ["stl", "step", "png", "json_receipt", "transcript", "prompt", "log"];
    return (order.indexOf(a.kind) ?? 99) - (order.indexOf(b.kind) ?? 99);
  });

  return (
    <div className="space-y-3">
      {sorted.map((artifact) => {
        const hasFile = !!artifact.storage_path;

        return (
          <div key={artifact.id} className="card">
            <div className="flex items-center gap-3">
              <span className="text-xl flex-shrink-0">
                {KIND_ICONS[artifact.kind] ?? "📄"}
              </span>

              <div className="flex-1 min-w-0">
                <p className="text-steel-200 text-sm font-medium">
                  {KIND_LABELS[artifact.kind] ?? artifact.kind}
                </p>
                <p className="text-steel-500 text-xs truncate">
                  {artifact.storage_path ?? "File not yet available"}
                </p>
              </div>

              <div className="flex items-center gap-3 flex-shrink-0">
                <p className="text-steel-400 text-xs">{formatBytes(artifact.file_size_bytes)}</p>

                {artifact.kind === "stl" && hasFile && (
                  <button
                    onClick={() =>
                      setExpandedStl(expandedStl === artifact.id ? null : artifact.id)
                    }
                    className="text-brand-400 hover:text-brand-300 text-xs transition-colors"
                  >
                    {expandedStl === artifact.id ? "Hide Preview" : "3D Preview"}
                  </button>
                )}

                {hasFile ? (
                  <a
                    href={`/api/artifacts/${artifact.id}/download`}
                    className="text-brand-400 hover:text-brand-300 text-xs transition-colors"
                    download
                  >
                    Download
                  </a>
                ) : (
                  <span
                    className="text-steel-600 text-xs cursor-not-allowed"
                    title="File not yet available — try regenerating this job"
                  >
                    Unavailable
                  </span>
                )}
              </div>
            </div>

            {/* Inline STL 3D preview — only when file is available */}
            {artifact.kind === "stl" && hasFile && expandedStl === artifact.id && (
              <div className="mt-4">
                <StlViewer
                  url={`/api/artifacts/${artifact.id}/download`}
                  width={600}
                  height={400}
                  className="rounded-lg overflow-hidden"
                />
                <p className="text-steel-500 text-xs mt-2 text-center">
                  Click and drag to rotate · Scroll to zoom · Right-click to pan
                </p>
              </div>
            )}

            {/* Inline notice for missing file */}
            {!hasFile && (
              <div className="mt-2 text-xs text-amber-400 bg-amber-900/20 border border-amber-800/50 rounded px-3 py-1.5">
                This artifact was generated before the storage upload fix. Use Regenerate to get a downloadable file.
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
