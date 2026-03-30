"use client";

/**
 * ProjectSearchClient — interactive search and filter for the project library.
 *
 * Calls GET /api/projects/search with debounced query, family filter, and sort.
 *
 * Phase 6: Searchable project library
 */

import { useState, useEffect, useCallback, useRef } from "react";

interface Project {
  id: string;
  title: string;
  description: string | null;
  family: string;
  parameters: Record<string, unknown>;
  stl_url: string | null;
  step_url: string | null;
  usage_count: number;
  rating: string | null;
  created_at: string;
  is_system: boolean;
}

interface Props {
  families: string[];
}

export function ProjectSearchClient({ families }: Props) {
  const [query, setQuery] = useState("");
  const [family, setFamily] = useState("");
  const [sort, setSort] = useState("popular");
  const [results, setResults] = useState<Project[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(
    async (q: string, fam: string, s: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ limit: "20", sort: s });
        if (q) params.set("q", q);
        if (fam) params.set("family", fam);
        const res = await fetch(`/api/projects/search?${params}`);
        if (!res.ok) throw new Error("Search failed");
        const data = await res.json();
        setResults(data.projects ?? []);
        setTotal(data.total ?? 0);
        setSearched(true);
      } catch {
        setResults([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!query && !family) {
      setSearched(false);
      setResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void doSearch(query, family, sort);
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, family, sort, doSearch]);

  return (
    <div className="space-y-4">
      {/* Search bar + filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-steel-500 text-sm">🔍</span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, description, or family…"
            className="w-full pl-9 pr-4 py-2.5 bg-steel-800 border border-steel-700 rounded-xl text-steel-100 placeholder-steel-500 text-sm focus:outline-none focus:border-brand-500 transition-colors"
          />
        </div>
        <select
          value={family}
          onChange={(e) => setFamily(e.target.value)}
          className="px-3 py-2.5 bg-steel-800 border border-steel-700 rounded-xl text-steel-300 text-sm focus:outline-none focus:border-brand-500 transition-colors"
        >
          <option value="">All families</option>
          {families.map((f) => (
            <option key={f} value={f}>
              {f.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="px-3 py-2.5 bg-steel-800 border border-steel-700 rounded-xl text-steel-300 text-sm focus:outline-none focus:border-brand-500 transition-colors"
        >
          <option value="popular">Most Popular</option>
          <option value="recent">Most Recent</option>
          <option value="rating">Highest Rated</option>
        </select>
      </div>

      {/* Results */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card h-36 animate-pulse bg-steel-800" />
          ))}
        </div>
      )}

      {!loading && searched && (
        <>
          <p className="text-steel-500 text-sm">
            {total === 0 ? "No results found." : `${total} result${total !== 1 ? "s" : ""}`}
          </p>
          {results.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {results.map((p) => (
                <SearchResultCard key={p.id} project={p} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SearchResultCard({ project }: { project: Project }) {
  return (
    <div className="card hover:border-brand-500/50 transition-colors group">
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-semibold text-steel-100 group-hover:text-brand-300 transition-colors line-clamp-2 text-sm">
          {project.title}
        </h3>
        {project.is_system && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-brand-900/50 text-brand-400 border border-brand-800 whitespace-nowrap">
            System
          </span>
        )}
      </div>

      <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-steel-700 text-steel-300 capitalize mb-2">
        {project.family.replace(/_/g, " ")}
      </span>

      {project.description && (
        <p className="text-steel-500 text-xs line-clamp-2 mb-2">{project.description}</p>
      )}

      <div className="flex items-center justify-between text-xs text-steel-600 pt-2 border-t border-steel-800">
        <span>{project.usage_count} uses</span>
        {project.rating && (
          <span className="text-yellow-500">★ {parseFloat(project.rating).toFixed(1)}</span>
        )}
      </div>

      {(project.stl_url || project.step_url) && (
        <div className="flex gap-3 mt-2">
          {project.stl_url && (
            <a
              href={project.stl_url}
              className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              ↓ STL
            </a>
          )}
          {project.step_url && (
            <a
              href={project.step_url}
              className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              ↓ STEP
            </a>
          )}
        </div>
      )}
    </div>
  );
}
