"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

interface InventionResult {
  invention_id: string | null;
  job_id: string;
  cad_run_id: string;
  family: string;
  family_description: string;
  parameters: Record<string, number>;
  reasoning: string;
  confidence: number;
  status: string;
}

interface RejectionResult {
  rejected: true;
  reason: string;
  confidence: number;
}

type State =
  | { phase: "idle" }
  | { phase: "inventing" }
  | { phase: "rejected"; result: RejectionResult }
  | { phase: "generating"; result: InventionResult }
  | { phase: "done"; result: InventionResult; jobStatus: string }
  | { phase: "error"; message: string };

const FAMILY_LABELS: Record<string, string> = {
  spacer: "Spacer",
  flat_bracket: "Flat Bracket",
  l_bracket: "L-Bracket",
  u_bracket: "U-Bracket",
  hole_plate: "Hole Plate",
  standoff_block: "Standoff Block",
  cable_clip: "Cable Clip",
  enclosure: "Enclosure",
  adapter_bushing: "Adapter Bushing",
  simple_jig: "Simple Jig",
};

function ParameterTable({ parameters }: { parameters: Record<string, number> }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {Object.entries(parameters).map(([key, value]) => (
          <tr key={key} className="border-b border-gray-100 last:border-0">
            <td className="py-1.5 pr-4 text-gray-500 font-medium capitalize">
              {key.replace(/_/g, " ")}
            </td>
            <td className="py-1.5 text-gray-900 font-mono">{value} mm</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ConfidenceBar({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const color = pct >= 85 ? "bg-green-500" : pct >= 65 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-200 rounded-full h-2">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium text-gray-700">{pct}%</span>
    </div>
  );
}

export default function InventionForm() {
  const [problem, setProblem] = useState("");
  const [state, setState] = useState<State>({ phase: "idle" });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Handle example prompt clicks (from parent page)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const btn = target.closest(".example-prompt") as HTMLElement | null;
      if (btn) {
        const example = btn.dataset.example ?? "";
        setProblem(example);
        textareaRef.current?.focus();
      }
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  // Poll job status when generating
  useEffect(() => {
    if (state.phase !== "generating") {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }

    const jobId = state.result.job_id;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}/status`);
        if (!res.ok) return;
        const data = await res.json();
        const status = data.status as string;

        if (
          status === "awaiting_approval" ||
          status === "approved" ||
          status === "printed"
        ) {
          clearInterval(pollRef.current!);
          setState({ phase: "done", result: state.result, jobStatus: status });
        } else if (status === "failed" || status === "rejected") {
          clearInterval(pollRef.current!);
          setState({
            phase: "error",
            message: `CAD generation ${status}. Please try again with different parameters.`,
          });
        }
        // Still generating — keep polling
      } catch {
        // Network error — keep polling
      }
    }, 3000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [state]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!problem.trim() || state.phase === "inventing" || state.phase === "generating") return;

    setState({ phase: "inventing" });

    try {
      const res = await fetch("/api/invent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problem }),
      });

      const data = await res.json();

      if (res.status === 422 && data.rejected) {
        setState({ phase: "rejected", result: data as RejectionResult });
        return;
      }

      if (!res.ok) {
        setState({ phase: "error", message: data.error ?? "Invention failed. Please try again." });
        return;
      }

      setState({ phase: "generating", result: data as InventionResult });
    } catch {
      setState({ phase: "error", message: "Network error — please try again." });
    }
  };

  const handleReset = () => {
    setState({ phase: "idle" });
    setProblem("");
  };

  return (
    <div>
      {/* Problem input form */}
      {(state.phase === "idle" || state.phase === "error" || state.phase === "rejected") && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Describe your problem
          </label>
          <textarea
            ref={textareaRef}
            value={problem}
            onChange={(e) => setProblem(e.target.value)}
            placeholder="e.g. I need a spacer to hold two aluminum plates 20mm apart with a 6mm bolt through the center..."
            rows={4}
            className="w-full px-4 py-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-gray-400">{problem.length}/1000 characters</span>
            <button
              type="submit"
              disabled={!problem.trim() || problem.length < 5}
              className="inline-flex items-center px-6 py-2.5 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Invent Solution →
            </button>
          </div>

          {state.phase === "error" && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{state.message}</p>
            </div>
          )}

          {state.phase === "rejected" && (
            <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm font-medium text-yellow-800 mb-1">
                Could not design a solution (confidence: {Math.round(state.result.confidence * 100)}%)
              </p>
              <p className="text-sm text-yellow-700">{state.result.reason}</p>
              <p className="text-xs text-yellow-600 mt-2">
                Try rephrasing with specific dimensions (e.g. &ldquo;I need a 20mm spacer with a 6mm hole&rdquo;).
              </p>
            </div>
          )}
        </form>
      )}

      {/* Inventing spinner */}
      {state.phase === "inventing" && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
          <div className="inline-flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-gray-700 font-medium">Designing your solution...</span>
          </div>
          <p className="mt-2 text-sm text-gray-500">
            Analyzing your problem and selecting the best part family.
          </p>
        </div>
      )}

      {/* Generating / Done result card */}
      {(state.phase === "generating" || state.phase === "done") && (
        <div className="space-y-4">
          {/* Design card */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <span className="inline-block text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded mb-1">
                  {FAMILY_LABELS[state.result.family] ?? state.result.family}
                </span>
                <h2 className="text-lg font-semibold text-gray-900">
                  {state.result.family_description}
                </h2>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500 mb-1">Confidence</p>
                <div className="w-32">
                  <ConfidenceBar confidence={state.result.confidence} />
                </div>
              </div>
            </div>

            <p className="text-sm text-gray-700 mb-4 leading-relaxed">{state.result.reasoning}</p>

            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                Dimensions
              </p>
              <ParameterTable parameters={state.result.parameters} />
            </div>
          </div>

          {/* Status card */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            {state.phase === "generating" ? (
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Generating CAD files...</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    The CAD worker is building your STL and STEP files. This usually takes 15–60 seconds.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">CAD files ready!</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Your design has been generated and is ready for review.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-3">
            <Link
              href={`/jobs/${state.result.job_id}`}
              className="inline-flex items-center px-5 py-2.5 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700"
            >
              View Design &amp; Download →
            </Link>
            <button
              onClick={handleReset}
              className="inline-flex items-center px-4 py-2.5 rounded-lg text-sm font-medium bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Invent Another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
