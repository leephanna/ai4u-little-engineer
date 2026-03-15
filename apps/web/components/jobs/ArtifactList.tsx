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
            <p className="text-steel-500 text-xs truncate">{artifact.storage_path}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-steel-400 text-xs">{formatBytes(artifact.file_size_bytes)}</p>
            <a
              href={`/api/artifacts/${artifact.id}/download`}
              className="text-brand-400 hover:text-brand-300 text-xs transition-colors"
              download
            >
              Download
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}
