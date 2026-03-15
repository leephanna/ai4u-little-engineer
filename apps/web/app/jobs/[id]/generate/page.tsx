"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { PartSpec } from "@/lib/types";

type VariantType = "requested" | "stronger" | "print_optimized" | "alternate";

const VARIANT_INFO: Record<VariantType, { label: string; desc: string; icon: string }> = {
  requested: {
    label: "As Requested",
    desc: "Generate exactly as specified",
    icon: "🎯",
  },
  stronger: {
    label: "Stronger",
    desc: "+25% wall thickness, larger fillets",
    icon: "💪",
  },
  print_optimized: {
    label: "Print Optimized",
    desc: "Minimize supports, better layer adhesion",
    icon: "🖨️",
  },
  alternate: {
    label: "Alternate",
    desc: "Different approach to the same problem",
    icon: "🔄",
  },
};

export default function GeneratePage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params.id as string;

  const [specs, setSpecs] = useState<PartSpec[]>([]);
  const [selectedSpecId, setSelectedSpecId] = useState<string | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<VariantType>("requested");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    async function loadSpecs() {
      const { data } = await supabase
        .from("part_specs")
        .select("*")
        .eq("job_id", jobId)
        .order("version", { ascending: false });

      if (data && data.length > 0) {
        setSpecs(data);
        setSelectedSpecId(data[0].id);
      }
    }
    loadSpecs();
  }, [jobId]);

  async function handleGenerate() {
    if (!selectedSpecId) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/jobs/${jobId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          part_spec_id: selectedSpecId,
          variant_type: selectedVariant,
          engine: "build123d",
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Generation failed");
      }

      router.push(`/jobs/${jobId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setLoading(false);
    }
  }

  const selectedSpec = specs.find((s) => s.id === selectedSpecId);

  return (
    <div className="min-h-screen bg-steel-900">
      <header className="border-b border-steel-800 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="text-steel-400 hover:text-steel-100 transition-colors p-1"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="font-semibold text-steel-100">Generate CAD</h1>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Spec selector */}
        {specs.length > 1 && (
          <section>
            <h2 className="text-sm font-medium text-steel-400 uppercase tracking-wide mb-3">
              Part Specification
            </h2>
            <div className="space-y-2">
              {specs.map((spec) => (
                <button
                  key={spec.id}
                  onClick={() => setSelectedSpecId(spec.id)}
                  className={`w-full card text-left transition-all ${
                    selectedSpecId === spec.id
                      ? "border-brand-600 bg-brand-950"
                      : "hover:border-steel-600"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-steel-200 text-sm font-medium capitalize">
                      {spec.family.replace(/_/g, " ")} — v{spec.version}
                    </span>
                    {selectedSpecId === spec.id && (
                      <span className="text-brand-400 text-xs">Selected</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Variant selector */}
        <section>
          <h2 className="text-sm font-medium text-steel-400 uppercase tracking-wide mb-3">
            Variant
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {(Object.entries(VARIANT_INFO) as [VariantType, typeof VARIANT_INFO[VariantType]][]).map(
              ([key, info]) => (
                <button
                  key={key}
                  onClick={() => setSelectedVariant(key)}
                  className={`card text-left transition-all ${
                    selectedVariant === key
                      ? "border-brand-600 bg-brand-950"
                      : "hover:border-steel-600"
                  }`}
                >
                  <div className="text-xl mb-1">{info.icon}</div>
                  <div className="font-medium text-steel-200 text-sm">{info.label}</div>
                  <div className="text-steel-500 text-xs mt-0.5">{info.desc}</div>
                </button>
              )
            )}
          </div>
        </section>

        {/* Selected spec summary */}
        {selectedSpec && (
          <section>
            <h2 className="text-sm font-medium text-steel-400 uppercase tracking-wide mb-3">
              Summary
            </h2>
            <div className="card">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                {Object.entries(selectedSpec.dimensions_json ?? {}).map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-steel-500 capitalize">{k.replace(/_/g, " ")}</span>
                    <span className="text-steel-200 font-mono">
                      {typeof v === "number" ? v.toFixed(2) : v} {selectedSpec.units}
                    </span>
                  </div>
                ))}
              </div>
              {selectedSpec.assumptions_json?.length > 0 && (
                <div className="mt-3 pt-3 border-t border-steel-700">
                  <p className="text-xs text-steel-500 mb-1">Assumptions applied:</p>
                  {selectedSpec.assumptions_json.map((a, i) => (
                    <p key={i} className="text-xs text-steel-400">→ {a}</p>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {error && (
          <div className="bg-red-900/30 border border-red-800 rounded-xl px-4 py-3 text-red-300 text-sm">
            {error}
          </div>
        )}

        <button
          onClick={handleGenerate}
          disabled={loading || !selectedSpecId}
          className="btn-primary w-full py-3 text-base touch-target"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Queuing generation...
            </span>
          ) : (
            "⚙️ Generate CAD Model"
          )}
        </button>

        <p className="text-center text-steel-500 text-xs">
          Generation typically takes 15–60 seconds depending on complexity.
        </p>
      </main>
    </div>
  );
}
