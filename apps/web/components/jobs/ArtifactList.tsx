"use client";

import type { Artifact } from "@/lib/types";

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

export function ArtifactList({ artifacts, jobId }: ArtifactListProps) {
  return (
    <div className="card divide-y divide-steel-700">
      {artifacts.map((artifact) => (
        <div key={artifact.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
          <span className="text-xl flex-shrink-0">
            {KIND_ICONS[artifact.kind] ?? "📄"}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-steel-200 text-sm font-medium">
              {KIND_LABELS[artifact.kind] ?? artifact.kind}
            </p>
            {artifact.local_only ? (
              /* Local-dev artifact — no storage path to show */
              <p className="text-yellow-500 text-xs">
                Local dev only — not persisted to Storage
              </p>
            ) : (
              <p className="text-steel-500 text-xs truncate">{artifact.storage_path}</p>
            )}
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-steel-400 text-xs">{formatBytes(artifact.file_size_bytes)}</p>

            {artifact.local_only ? (
              /* Explicitly block download for local-only artifacts */
              <span
                className="text-yellow-600 text-xs cursor-not-allowed select-none"
                title="This artifact was generated in local-dev mode and was never uploaded to Supabase Storage. Re-run in production to get a downloadable file."
              >
                Not available
              </span>
            ) : (
              <a
                href={`/api/artifacts/${artifact.id}/download`}
                className="text-brand-400 hover:text-brand-300 text-xs transition-colors"
                download
              >
                Download
              </a>
            )}
          </div>
        </div>
      ))}

      {/* Banner when any artifact in the list is local-only */}
      {artifacts.some((a) => a.local_only) && (
        <div className="pt-3">
          <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg px-3 py-2 text-yellow-300 text-xs">
            <strong>Local dev mode:</strong> One or more artifacts were generated with{" "}
            <code className="font-mono">ALLOW_LOCAL_ARTIFACT_PATHS=true</code> and were
            never uploaded to Supabase Storage. Downloads are unavailable. Re-run this
            job in a production environment to generate downloadable artifacts.
          </div>
        </div>
      )}
    </div>
  );
}
