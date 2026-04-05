"use client";

/**
 * ArtemisIIDemoCard
 *
 * Featured demo card for the Artemis II Launch Pad showcase print.
 *
 * IMPORTANT DISCLAIMER:
 * This is a commemorative/demo print experience inspired by the Artemis II mission.
 * It is NOT an official NASA flight-certified model or endorsed by NASA.
 * It is a showcase print for the AI4U Little Engineer platform.
 *
 * User selects:
 *   - Printer make/model (or "standard")
 *   - Material (PLA / PETG / ABS)
 *   - Quality preset (draft / standard / fine)
 *   - Scale preset (small / medium / display)
 *
 * Then the system:
 *   - Shows the pre-configured print parameters
 *   - Displays VPL score preview and trust tier
 *   - Lets the user click GO to trigger generation
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Material = "PLA" | "PETG" | "ABS";
type Quality = "draft" | "standard" | "fine";
type Scale = "small" | "medium" | "display";

interface DemoConfig {
  material: Material;
  quality: Quality;
  scale: Scale;
  printerMake: string;
}

// Pre-configured Artemis II demo parameters by scale
// Track 1 fix: updated to match spacer (cylindrical rocket body) dimensions
const SCALE_PARAMS: Record<Scale, { height_mm: number; diameter_mm: number; label: string; time: string; filament: string }> = {
  small: {
    height_mm: 120,
    diameter_mm: 32,
    label: "Small (12cm)",
    time: "~1.5h",
    filament: "~35g",
  },
  medium: {
    height_mm: 200,
    diameter_mm: 50,
    label: "Medium (20cm)",
    time: "~3h",
    filament: "~70g",
  },
  display: {
    height_mm: 320,
    diameter_mm: 75,
    label: "Display (32cm)",
    time: "~7h",
    filament: "~150g",
  },
};

const QUALITY_LABELS: Record<Quality, string> = {
  draft: "Draft (fast)",
  standard: "Standard",
  fine: "Fine (detailed)",
};

const MATERIAL_NOTES: Record<Material, string> = {
  PLA: "Best for display — easy to print",
  PETG: "More durable — good for handling",
  ABS: "Strongest — requires enclosure",
};

// Simulated VPL scores by quality
const VPL_SCORES: Record<Quality, { score: number; grade: string; tier: string }> = {
  draft: { score: 72, grade: "B", tier: "Verified" },
  standard: { score: 84, grade: "A", tier: "Trusted Commercial" },
  fine: { score: 91, grade: "A", tier: "Trusted Commercial" },
};

export default function ArtemisIIDemoCard() {
  const router = useRouter();
  const [config, setConfig] = useState<DemoConfig>({
    material: "PLA",
    quality: "standard",
    scale: "medium",
    printerMake: "Standard",
  });
  const [phase, setPhase] = useState<"config" | "preview" | "generating" | "done">("config");
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsAuthenticated(!!user);
    });
  }, []);

  const scaleParams = SCALE_PARAMS[config.scale];
  const vpl = VPL_SCORES[config.quality];

  const handleGo = async () => {
    // Belt-and-suspenders auth check before calling the API
    if (!isAuthenticated) {
      setError("sign_in_required");
      return;
    }
    setPhase("generating");
    setError(null);

    try {
      const res = await fetch("/api/demo/artemis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scale: config.scale,
          material: config.material,
          quality: config.quality,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) {
          setError("sign_in_required");
          setPhase("config");
          return;
        }
        if (data.upgrade_required) {
          setError("Monthly limit reached. Please upgrade your plan.");
          setPhase("preview");
          return;
        }
        throw new Error(data.error ?? "Generation failed");
      }

      const data = await res.json();
      setJobId(data.job_id);
      setPhase("done");
      setTimeout(() => router.push(`/jobs/${data.job_id}`), 1500);
    } catch {
      setError("Generation failed. Please try again.");
      setPhase("preview");
    }
  };

  return (
    <div className="rounded-2xl border border-brand-800 bg-gradient-to-br from-steel-900 via-brand-950/30 to-steel-900 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-brand-800/50 flex items-start gap-3">
        <div className="text-3xl flex-shrink-0">🚀</div>
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs font-bold text-brand-400 uppercase tracking-wider">
              Featured Demo
            </span>
            <span className="text-xs bg-brand-900 border border-brand-700 text-brand-300 rounded-full px-2 py-0.5">
              Showcase Print
            </span>
          </div>
          <h3 className="text-base font-bold text-steel-100">
            Artemis II Launch Pad Demo
          </h3>
          <p className="text-xs text-steel-400 mt-0.5 leading-relaxed">
            A commemorative scale model inspired by the Artemis II mission — rocket + launch pad,
            consumer-safe, printable on any FDM printer.
          </p>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="mx-4 mt-3 px-3 py-2 bg-steel-800/50 border border-steel-700 rounded-lg">
        <p className="text-xs text-steel-500 leading-relaxed">
          ⚠ This is a showcase print inspired by the Artemis II mission. It is not an official
          NASA model, flight-certified design, or NASA-endorsed product. For display and
          educational purposes only.
        </p>
      </div>

      {/* Configuration */}
      {(phase === "config" || phase === "preview") && (
        <div className="p-4 space-y-4">
          {/* Scale selector */}
          <div>
            <label className="text-xs text-steel-400 font-medium block mb-2">Scale</label>
            <div className="grid grid-cols-3 gap-2">
              {(["small", "medium", "display"] as Scale[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setConfig((c) => ({ ...c, scale: s }))}
                  className={`py-2 rounded-lg text-xs font-medium border transition-all ${
                    config.scale === s
                      ? "bg-brand-700 border-brand-500 text-white"
                      : "bg-steel-800 border-steel-700 text-steel-400 hover:border-steel-500"
                  }`}
                >
                  {SCALE_PARAMS[s].label}
                </button>
              ))}
            </div>
          </div>

          {/* Material selector */}
          <div>
            <label className="text-xs text-steel-400 font-medium block mb-2">Material</label>
            <div className="grid grid-cols-3 gap-2">
              {(["PLA", "PETG", "ABS"] as Material[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setConfig((c) => ({ ...c, material: m }))}
                  className={`py-2 rounded-lg text-xs font-medium border transition-all ${
                    config.material === m
                      ? "bg-brand-700 border-brand-500 text-white"
                      : "bg-steel-800 border-steel-700 text-steel-400 hover:border-steel-500"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            <p className="text-xs text-steel-500 mt-1.5">{MATERIAL_NOTES[config.material]}</p>
          </div>

          {/* Quality selector */}
          <div>
            <label className="text-xs text-steel-400 font-medium block mb-2">Quality</label>
            <div className="grid grid-cols-3 gap-2">
              {(["draft", "standard", "fine"] as Quality[]).map((q) => (
                <button
                  key={q}
                  onClick={() => setConfig((c) => ({ ...c, quality: q }))}
                  className={`py-2 rounded-lg text-xs font-medium border transition-all ${
                    config.quality === q
                      ? "bg-brand-700 border-brand-500 text-white"
                      : "bg-steel-800 border-steel-700 text-steel-400 hover:border-steel-500"
                  }`}
                >
                  {QUALITY_LABELS[q]}
                </button>
              ))}
            </div>
          </div>

          {/* Preview stats */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-steel-800 rounded-lg p-3">
              <div className="text-xs text-steel-500 mb-1">Est. Print Time</div>
              <div className="text-sm font-bold text-steel-100">{scaleParams.time}</div>
            </div>
            <div className="bg-steel-800 rounded-lg p-3">
              <div className="text-xs text-steel-500 mb-1">Filament</div>
              <div className="text-sm font-bold text-steel-100">
                {scaleParams.filament} {config.material}
              </div>
              <div className="text-xs text-steel-500 mt-1">
                ⌀{scaleParams.diameter_mm}mm × {scaleParams.height_mm}mm
              </div>
            </div>
          </div>

          {/* VPL preview */}
          <div className="flex items-center justify-between bg-steel-800/50 border border-steel-700 rounded-lg px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-xs text-steel-400">VPL Score</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                vpl.grade === "A"
                  ? "bg-green-900/50 text-green-300 border border-green-700"
                  : "bg-yellow-900/50 text-yellow-300 border border-yellow-700"
              }`}>
                {vpl.grade} — {vpl.score}/100
              </span>
            </div>
            <span className="text-xs text-brand-400 font-medium">{vpl.tier}</span>
          </div>

          {error === "sign_in_required" ? (
            <div className="text-sm text-brand-300 bg-brand-900/30 border border-brand-700 rounded-lg px-4 py-3 text-center">
              <p className="font-semibold mb-1">Sign in to generate this model</p>
              <p className="text-xs text-steel-400 mb-3">Create a free account to generate and download your Artemis II model.</p>
              <a
                href="/signup?redirect=/demo/artemis"
                className="inline-block px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold rounded-lg transition-colors"
              >
                Sign Up Free →
              </a>
              <span className="mx-2 text-steel-600 text-xs">or</span>
              <a
                href="/login?redirect=/demo/artemis"
                className="inline-block px-4 py-2 bg-steel-700 hover:bg-steel-600 text-steel-200 text-xs font-bold rounded-lg transition-colors"
              >
                Log In
              </a>
            </div>
          ) : error ? (
            <div className="text-xs text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
              {error}
            </div>
          ) : null}

          {/* GO button */}
          <button
            onClick={handleGo}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-brand-600 to-purple-600 hover:from-brand-500 hover:to-purple-500 text-white font-bold text-sm transition-all shadow-lg shadow-brand-900/30"
          >
            🚀 GO — Generate Artemis II Demo
          </button>
        </div>
      )}

      {/* Generating */}
      {phase === "generating" && (
        <div className="p-8 text-center">
          <div className="text-4xl mb-3 animate-bounce">🚀</div>
          <div className="text-steel-200 font-semibold mb-1">Launching generation…</div>
          <p className="text-sm text-steel-500">
            Building your Artemis II commemorative model. This takes 15–60 seconds.
          </p>
          <div className="mt-4 flex justify-center">
            <div className="w-6 h-6 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
          </div>
        </div>
      )}

      {/* Done */}
      {phase === "done" && jobId && (
        <div className="p-6 text-center">
          <div className="text-3xl mb-2">✅</div>
          <div className="text-steel-200 font-semibold mb-1">Artemis II model generated!</div>
          <p className="text-sm text-steel-400">Redirecting to your result page…</p>
        </div>
      )}
    </div>
  );
}
