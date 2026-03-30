/**
 * /projects — Searchable project library
 *
 * Displays community and user-saved CAD designs with search, filter, and reuse.
 * Server-rendered with Suspense for search results.
 *
 * Phase 6: Searchable project library
 */

import { Suspense } from "react";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { ProjectSearchClient } from "./ProjectSearchClient";

export const metadata = {
  title: "Project Library — AI4U Little Engineer",
  description: "Browse and reuse community CAD designs for 3D printing.",
};

export const dynamic = "force-dynamic";

const FAMILIES = [
  "spacer", "l_bracket", "flat_bracket", "u_bracket", "hole_plate",
  "enclosure", "standoff_block", "adapter_bushing", "cable_clip", "simple_jig",
];

interface ProjectRow {
  id: string;
  title: string;
  description: string | null;
  family: string;
  usage_count: number | null;
  rating: number | null;
  created_at: string;
  is_system: boolean | null;
  stl_url?: string | null;
  step_url?: string | null;
}

async function getFeaturedProjects(): Promise<ProjectRow[]> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("projects")
    .select("id, title, description, family, usage_count, rating, created_at, is_system")
    .order("usage_count", { ascending: false })
    .limit(6);
  return (data ?? []) as ProjectRow[];
}

async function getStats() {
  const supabase = createServiceClient();
  const { count } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true });
  return { total: count ?? 0 };
}

export default async function ProjectsPage() {
  const [featured, stats] = await Promise.all([getFeaturedProjects(), getStats()]);

  return (
    <div className="min-h-screen bg-steel-900">
      {/* Nav */}
      <nav className="border-b border-steel-800 px-6 py-4 flex items-center justify-between">
        <Link href="/dashboard" className="font-bold text-steel-100 text-lg">
          ⚙️ AI4U Little Engineer
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-steel-400 hover:text-steel-100 text-sm transition-colors">
            Dashboard
          </Link>
          <Link href="/account" className="text-steel-400 hover:text-steel-100 text-sm transition-colors">
            Account
          </Link>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 py-10 space-y-10">
        {/* Header */}
        <div className="text-center space-y-3">
          <h1 className="text-3xl font-bold text-steel-100">Project Library</h1>
          <p className="text-steel-400 max-w-xl mx-auto">
            Browse {stats.total.toLocaleString()} community designs. Search by name, family, or description — then reuse any design as a starting point for your next part.
          </p>
        </div>

        {/* Search + Filter (client component) */}
        <Suspense fallback={<div className="h-12 bg-steel-800 rounded-xl animate-pulse" />}>
          <ProjectSearchClient families={FAMILIES} />
        </Suspense>

        {/* Featured / Popular */}
        {featured.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-steel-400 uppercase tracking-wide mb-4">
              Most Used Designs
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {featured.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </div>
          </section>
        )}

        {featured.length === 0 && (
          <div className="card text-center py-16 space-y-4">
            <div className="text-4xl">📦</div>
            <h3 className="text-lg font-semibold text-steel-200">No projects yet</h3>
            <p className="text-steel-500 text-sm max-w-sm mx-auto">
              Generate your first CAD part and save it to the library to get started.
            </p>
            <Link href="/dashboard" className="btn-primary inline-block text-sm py-2 px-6">
              Generate a Part
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectCard({
  project,
}: {
  project: ProjectRow;
}) {
  const familyLabel = project.family?.replace(/_/g, " ") ?? "unknown";

  return (
    <div className="card hover:border-brand-500/50 transition-colors group">
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-semibold text-steel-100 group-hover:text-brand-300 transition-colors line-clamp-2">
          {project.title}
        </h3>
        {project.is_system && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-brand-900/50 text-brand-400 border border-brand-800 whitespace-nowrap">
            System
          </span>
        )}
      </div>

      <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-steel-700 text-steel-300 capitalize mb-2">
        {familyLabel}
      </span>

      {project.description && (
        <p className="text-steel-500 text-xs line-clamp-2 mb-3">
          {project.description}
        </p>
      )}

      <div className="flex items-center justify-between text-xs text-steel-600 mt-auto pt-2 border-t border-steel-800">
        <span>{project.usage_count ?? 0} uses</span>
        {project.rating && (
          <span className="text-yellow-500">
            ★ {project.rating.toFixed(1)}
          </span>
        )}
        <span>{new Date(project.created_at).toLocaleDateString()}</span>
      </div>

      {(project.stl_url || project.step_url) && (
        <div className="flex gap-2 mt-3">
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
