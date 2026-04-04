/**
 * /library — Permanent redirect to /projects
 *
 * Several components (PrintEstimatePanel, ProjectImageGallery) link to /library.
 * The actual searchable project library lives at /projects.
 * This page resolves the 404 by redirecting immediately.
 */
import { redirect } from "next/navigation";

export default function LibraryPage() {
  redirect("/projects");
}
