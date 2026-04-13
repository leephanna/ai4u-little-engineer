"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { VplGradeBadge } from "@/components/VplGradeBadge";
import { TrustBadge } from "@/components/TrustBadge";

interface Project {
  id: string;
  title: string;
  description: string | null;
  family: string;
  price: number | null;
  is_public: boolean;
  stl_url: string | null;
  step_url: string | null;
  success_score: number | null;
  success_rate: number | null;
  successful_prints: number;
  failed_prints: number;
  best_material: string | null;
  usage_count: number;
  rating: number | null;
  earnings_total: number;
  creator_id: string | null;
  created_by: string | null;
  created_at: string;
  print_success_score: number | null;
  vpl_grade: string | null;
  // Trust Policy fields (migration 008)
  trust_tier: string | null;
  marketplace_allowed: boolean;
}

interface Props {
  projects: Project[];
  ownedProjectIds: string[];
  isAuthenticated: boolean;
}

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

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs text-gray-400">No score</span>;
  const color =
    score >= 80 ? "bg-green-100 text-green-800" :
    score >= 60 ? "bg-yellow-100 text-yellow-800" :
    "bg-red-100 text-red-800";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      ★ {score.toFixed(0)}/100
    </span>
  );
}

function PurchaseButton({
  project,
  isOwned,
  isAuthenticated,
}: {
  project: Project;
  isOwned: boolean;
  isAuthenticated: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBuy = async () => {
    if (!isAuthenticated) {
      window.location.href = "/sign-in";
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/marketplace/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: project.id }),
      });
      const data = await res.json();
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
      } else {
        setError(data.error ?? "Checkout failed");
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (isOwned) {
    return (
      <div className="flex gap-2">
        <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
          ✓ Owned
        </span>
        {project.stl_url && (
          <a
            href={project.stl_url}
            download
            className="inline-flex items-center px-3 py-1 rounded text-xs font-medium bg-blue-600 text-white hover:bg-blue-700"
          >
            Download STL
          </a>
        )}
      </div>
    );
  }

  if (!project.price || project.price <= 0) {
    return (
      <div className="flex gap-2 items-center">
        <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">
          Free
        </span>
        {project.stl_url && (
          <a
            href={project.stl_url}
            download
            className="inline-flex items-center px-3 py-1 rounded text-xs font-medium bg-green-600 text-white hover:bg-green-700"
          >
            Download STL
          </a>
        )}
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={handleBuy}
        disabled={loading}
        className="inline-flex items-center px-4 py-1.5 rounded text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {loading ? "Redirecting..." : `Buy $${project.price.toFixed(2)}`}
      </button>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}

export default function MarketplaceClient({
  projects,
  ownedProjectIds,
  isAuthenticated,
}: Props) {
  const [search, setSearch] = useState("");
  const [familyFilter, setFamilyFilter] = useState("all");
  const [priceFilter, setPriceFilter] = useState("all");
  const [, startTransition] = useTransition();

  const families = Array.from(new Set(projects.map((p) => p.family))).sort();

  const filtered = projects.filter((p) => {
    const matchesSearch =
      !search ||
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      (p.description ?? "").toLowerCase().includes(search.toLowerCase()) ||
      p.family.toLowerCase().includes(search.toLowerCase());
    const matchesFamily = familyFilter === "all" || p.family === familyFilter;
    const matchesPrice =
      priceFilter === "all" ||
      (priceFilter === "free" && (!p.price || p.price <= 0)) ||
      (priceFilter === "paid" && p.price && p.price > 0);
    return matchesSearch && matchesFamily && matchesPrice;
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Design Marketplace</h1>
          <p className="mt-2 text-gray-600">
            Browse and download community-tested 3D-printable designs, ranked by real print success data.
          </p>
          <div className="mt-4 flex gap-3">
            <Link
              href="/invent"
              className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700"
            >
              + Invent a New Design
            </Link>
            <Link
              href="/projects"
              className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              My Library
            </Link>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-6 flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Search designs..."
            value={search}
            onChange={(e) => startTransition(() => setSearch(e.target.value))}
            className="flex-1 min-w-48 px-4 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <select
            value={familyFilter}
            onChange={(e) => startTransition(() => setFamilyFilter(e.target.value))}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All families</option>
            {families.map((f) => (
              <option key={f} value={f}>{FAMILY_LABELS[f] ?? f}</option>
            ))}
          </select>
          <select
            value={priceFilter}
            onChange={(e) => startTransition(() => setPriceFilter(e.target.value))}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All prices</option>
            <option value="free">Free only</option>
            <option value="paid">Paid only</option>
          </select>
        </div>

        {/* Results count */}
        <p className="text-sm text-gray-500 mb-4">
          {filtered.length} design{filtered.length !== 1 ? "s" : ""} found
        </p>

        {/* Design grid */}
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-500 text-lg">No designs match your filters.</p>
            <Link href="/invent" className="mt-4 inline-block text-indigo-600 hover:underline">
              Invent one →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((project) => {
              const isOwned = ownedProjectIds.includes(project.id);
              return (
                <div
                  key={project.id}
                  className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow p-5 flex flex-col gap-3"
                >
                  {/* Title and family */}
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-gray-900 text-sm leading-tight line-clamp-2">
                        {project.title}
                      </h3>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <VplGradeBadge score={project.print_success_score ?? null} grade={project.vpl_grade ?? null} />
                        <TrustBadge trustTier={project.trust_tier} />
                        <ScoreBadge score={project.success_score} />
                      </div>
                    </div>
                    <span className="inline-block mt-1 text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                      {FAMILY_LABELS[project.family] ?? project.family}
                    </span>
                  </div>

                  {/* Description */}
                  {project.description && (
                    <p className="text-xs text-gray-600 line-clamp-2">{project.description}</p>
                  )}

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-gray-50 rounded p-1.5">
                      <div className="text-sm font-semibold text-gray-900">
                        {project.success_rate !== null ? `${project.success_rate.toFixed(0)}%` : "—"}
                      </div>
                      <div className="text-xs text-gray-500">Success</div>
                    </div>
                    <div className="bg-gray-50 rounded p-1.5">
                      <div className="text-sm font-semibold text-gray-900">
                        {project.usage_count}
                      </div>
                      <div className="text-xs text-gray-500">Uses</div>
                    </div>
                    <div className="bg-gray-50 rounded p-1.5">
                      <div className="text-sm font-semibold text-gray-900">
                        {project.rating !== null ? project.rating.toFixed(1) : "—"}
                      </div>
                      <div className="text-xs text-gray-500">Rating</div>
                    </div>
                  </div>

                  {/* Best material */}
                  {project.best_material && (
                    <p className="text-xs text-gray-500">
                      Best material: <span className="font-medium text-gray-700">{project.best_material}</span>
                    </p>
                  )}

                  {/* Purchase / download */}
                  <div className="mt-auto pt-2 border-t border-gray-100">
                    <PurchaseButton
                      project={project}
                      isOwned={isOwned}
                      isAuthenticated={isAuthenticated}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
