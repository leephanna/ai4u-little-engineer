"use client";

/**
 * FeedbackUploadWidget — allows users to upload a print photo on the job page.
 *
 * Requires an existing print_feedback row (created via the print-result page).
 * Uploads to POST /api/feedback/upload and triggers multimodal analysis.
 *
 * Phase 7: UX improvements
 */

import { useState, useRef } from "react";

interface Props {
  feedbackId: string;
  jobId: string;
}

export function FeedbackUploadWidget({ feedbackId, jobId }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setError(null);
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("image", file);
      form.append("feedback_id", feedbackId);
      form.append("job_id", jobId);
      const res = await fetch("/api/feedback/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setDone(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  if (done) {
    return (
      <div className="card border-green-800 bg-green-950/20">
        <div className="flex items-center gap-3">
          <span className="text-green-400 text-xl">✓</span>
          <div>
            <p className="text-green-300 font-medium text-sm">Photo uploaded</p>
            <p className="text-steel-500 text-xs">AI analysis is running in the background</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card space-y-3">
      <div>
        <p className="text-sm font-medium text-steel-200">Upload Print Photo</p>
        <p className="text-xs text-steel-500 mt-0.5">
          Share a photo of your print for AI quality analysis and printer calibration
        </p>
      </div>

      <div
        className="border-2 border-dashed border-steel-700 rounded-xl p-4 text-center cursor-pointer hover:border-brand-600 transition-colors"
        onClick={() => inputRef.current?.click()}
      >
        {file ? (
          <p className="text-steel-300 text-sm">{file.name} ({(file.size / 1024).toFixed(0)} KB)</p>
        ) : (
          <p className="text-steel-500 text-sm">Click to select a photo (JPG, PNG, WebP · max 10MB)</p>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {error && <p className="text-red-400 text-xs">{error}</p>}

      <button
        onClick={handleUpload}
        disabled={!file || uploading}
        className="btn-primary text-sm py-2 px-4 disabled:opacity-50 w-full"
      >
        {uploading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Uploading…
          </span>
        ) : (
          "Upload Photo"
        )}
      </button>
    </div>
  );
}
