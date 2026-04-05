"use client";
/**
 * JobProgressBanner
 *
 * Shown when a job is in a non-terminal active state.
 * Replaces the misleading red failure indicators with a clear progress state.
 */
import { useEffect, useState } from "react";

interface Props {
  status: string;
  cadRunStatus?: string | null;
}

const STATUS_MESSAGES: Record<string, { label: string; detail: string }> = {
  draft: {
    label: "Preparing your design",
    detail: "Setting up the generation pipeline…",
  },
  clarifying: {
    label: "Gathering details",
    detail: "The assistant is collecting the remaining information needed to generate your part.",
  },
  generating: {
    label: "Generating CAD",
    detail: "The CAD engine is building your STL and STEP files. This usually takes 15–60 seconds.",
  },
  queued: {
    label: "Queued for generation",
    detail: "Your job is in the queue. It will start shortly.",
  },
  running: {
    label: "Running Virtual Print Lab",
    detail: "Analysing geometry, slicer simulation, and heuristics…",
  },
  awaiting_approval: {
    label: "Awaiting your review",
    detail: "Your design is ready. Please review and approve below.",
  },
};

const CAD_RUN_PROGRESS: Record<string, string> = {
  queued: "Generating CAD",
  running: "Running Virtual Print Lab",
  success: "Awaiting artifacts",
};

export function JobProgressBanner({ status, cadRunStatus }: Props) {
  const [dots, setDots] = useState(".");

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((d) => (d.length >= 3 ? "." : d + "."));
    }, 600);
    return () => clearInterval(interval);
  }, []);

  const msg = STATUS_MESSAGES[status];
  if (!msg) return null;

  // For awaiting_approval, show a different (non-spinner) style
  if (status === "awaiting_approval") {
    return (
      <div className="rounded-xl border border-brand-700 bg-brand-900/20 px-4 py-3 flex items-center gap-3">
        <span className="text-xl">👀</span>
        <div>
          <p className="text-sm font-semibold text-brand-300">{msg.label}</p>
          <p className="text-xs text-steel-400">{msg.detail}</p>
        </div>
      </div>
    );
  }

  // Derive the step label from cadRunStatus if available
  const stepLabel =
    cadRunStatus && CAD_RUN_PROGRESS[cadRunStatus]
      ? CAD_RUN_PROGRESS[cadRunStatus]
      : msg.label;

  return (
    <div className="rounded-xl border border-steel-700 bg-steel-800/60 px-4 py-3 flex items-center gap-3">
      <div className="w-5 h-5 border-2 border-brand-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-steel-200">
          {stepLabel}{dots}
        </p>
        <p className="text-xs text-steel-400 mt-0.5">{msg.detail}</p>
      </div>
    </div>
  );
}
