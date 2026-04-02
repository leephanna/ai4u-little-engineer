"use client";

/**
 * ProjectImageGallery
 *
 * Displays AI-generated concept images for a project.
 * Shows a "render" (studio shot) and a "context" (real-world usage) image.
 * Includes a "Generate Images" button that calls the image generation API.
 *
 * Usage:
 *   <ProjectImageGallery projectId={project.id} images={existingImages} isOwner={true} />
 */

import { useState } from "react";
import Image from "next/image";

interface ProjectImage {
  id: string;
  project_id: string;
  image_type: "render" | "context";
  url: string;
  created_at: string;
}

interface ProjectImageGalleryProps {
  projectId: string;
  images?: ProjectImage[];
  isOwner?: boolean;
  className?: string;
}

const IMAGE_TYPE_LABELS: Record<string, { label: string; description: string }> = {
  render: {
    label: "Concept Render",
    description: "AI-generated studio render of the 3D-printed part",
  },
  context: {
    label: "Usage Context",
    description: "AI-generated real-world usage photo",
  },
};

export function ProjectImageGallery({
  projectId,
  images: initialImages = [],
  isOwner = false,
  className = "",
}: ProjectImageGalleryProps) {
  const [images, setImages] = useState<ProjectImage[]>(initialImages);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeImage, setActiveImage] = useState<ProjectImage | null>(
    initialImages[0] ?? null
  );

  const renderImage = images.find((i) => i.image_type === "render");
  const contextImage = images.find((i) => i.image_type === "context");
  const hasImages = images.length > 0;

  async function generateImages() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/images`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      setImages(data.images ?? []);
      if (data.images?.length > 0) {
        setActiveImage(data.images[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Image generation failed");
    } finally {
      setGenerating(false);
    }
  }

  if (!hasImages && !isOwner) return null;

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Main image display */}
      {hasImages && activeImage ? (
        <div className="relative rounded-xl overflow-hidden bg-steel-800 aspect-square max-h-80">
          <Image
            src={activeImage.url}
            alt={IMAGE_TYPE_LABELS[activeImage.image_type]?.label ?? "Project image"}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 600px"
            unoptimized // DALL-E URLs are temporary; skip Next.js optimization
          />
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-steel-900/80 to-transparent px-3 py-2">
            <span className="text-xs text-steel-300 font-medium">
              {IMAGE_TYPE_LABELS[activeImage.image_type]?.label}
            </span>
            <p className="text-xs text-steel-500">
              {IMAGE_TYPE_LABELS[activeImage.image_type]?.description}
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl bg-steel-800 border border-steel-700 border-dashed aspect-square max-h-80 flex flex-col items-center justify-center gap-3">
          <div className="text-4xl opacity-30">🎨</div>
          <p className="text-steel-500 text-sm text-center px-4">
            No concept images yet. Generate AI visuals for this design.
          </p>
        </div>
      )}

      {/* Thumbnail strip */}
      {images.length > 1 && (
        <div className="flex gap-2">
          {images.map((img) => (
            <button
              key={img.id}
              onClick={() => setActiveImage(img)}
              className={`relative w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors flex-shrink-0 ${
                activeImage?.id === img.id
                  ? "border-brand-500"
                  : "border-steel-700 hover:border-steel-500"
              }`}
            >
              <Image
                src={img.url}
                alt={IMAGE_TYPE_LABELS[img.image_type]?.label ?? ""}
                fill
                className="object-cover"
                sizes="64px"
                unoptimized
              />
            </button>
          ))}
        </div>
      )}

      {/* Type indicators */}
      {hasImages && (
        <div className="flex gap-2 flex-wrap">
          {renderImage && (
            <span className="inline-flex items-center gap-1 text-xs bg-indigo-900/30 text-indigo-300 border border-indigo-800 rounded px-2 py-0.5">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Concept Render
            </span>
          )}
          {contextImage && (
            <span className="inline-flex items-center gap-1 text-xs bg-emerald-900/30 text-emerald-300 border border-emerald-800 rounded px-2 py-0.5">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Usage Context
            </span>
          )}
          <span className="text-xs text-steel-600 self-center">AI-generated visuals</span>
        </div>
      )}

      {/* Generate button (owner only) */}
      {isOwner && !hasImages && (
        <button
          onClick={generateImages}
          disabled={generating}
          className="btn-secondary text-sm w-full flex items-center justify-center gap-2"
        >
          {generating ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Generating visuals…
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Generate AI Visuals
            </>
          )}
        </button>
      )}

      {isOwner && hasImages && (
        <button
          onClick={generateImages}
          disabled={generating}
          className="text-xs text-steel-500 hover:text-steel-300 transition-colors"
        >
          {generating ? "Regenerating…" : "Regenerate visuals"}
        </button>
      )}

      {error && (
        <p className="text-xs text-red-400 bg-red-900/20 border border-red-800 rounded px-3 py-2">
          {error}
        </p>
      )}
    </div>
  );
}

export default ProjectImageGallery;
