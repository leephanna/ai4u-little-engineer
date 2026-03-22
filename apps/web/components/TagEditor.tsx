"use client";

import { useState } from "react";

const SUGGESTED_TAGS = [
  "bracket",
  "spacer",
  "jig",
  "bushing",
  "enclosure",
  "mount",
  "clip",
  "hinge",
  "standoff",
  "adapter",
  "prototype",
  "production",
  "metric",
  "imperial",
];

interface TagEditorProps {
  jobId: string;
  initialTags: string[];
  onTagsChange?: (tags: string[]) => void;
}

export function TagEditor({ jobId, initialTags, onTagsChange }: TagEditorProps) {
  const [tags, setTags] = useState<string[]>(initialTags);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);

  async function saveTags(newTags: string[]) {
    setSaving(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/tags`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: newTags }),
      });
      if (res.ok) {
        setTags(newTags);
        onTagsChange?.(newTags);
      }
    } finally {
      setSaving(false);
    }
  }

  function addTag(tag: string) {
    const normalized = tag.toLowerCase().trim().replace(/\s+/g, "-");
    if (!normalized || tags.includes(normalized)) return;
    saveTags([...tags, normalized]);
  }

  function removeTag(tag: string) {
    saveTags(tags.filter((t) => t !== tag));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(input);
      setInput("");
    } else if (e.key === "Backspace" && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  }

  const suggestions = SUGGESTED_TAGS.filter(
    (t) => !tags.includes(t) && t.includes(input.toLowerCase())
  ).slice(0, 6);

  return (
    <div className="card">
      <h3 className="font-semibold text-steel-200 mb-3">
        Tags
        {saving && (
          <span className="ml-2 text-xs text-steel-500 font-normal">Saving…</span>
        )}
      </h3>

      {/* Current tags */}
      <div className="flex flex-wrap gap-2 mb-3">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 bg-brand-900/50 border border-brand-800 text-brand-300 text-xs px-2 py-0.5 rounded-full"
          >
            #{tag}
            <button
              onClick={() => removeTag(tag)}
              className="text-brand-500 hover:text-brand-200 transition-colors"
              aria-label={`Remove tag ${tag}`}
            >
              ×
            </button>
          </span>
        ))}
        {tags.length === 0 && (
          <span className="text-xs text-steel-600">No tags yet</span>
        )}
      </div>

      {/* Input */}
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Add a tag…"
        className="w-full bg-steel-800 border border-steel-700 rounded-lg px-3 py-2 text-sm text-steel-200 placeholder-steel-600 focus:outline-none focus:border-brand-600 mb-2"
      />

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => addTag(s)}
              className="text-xs text-steel-400 hover:text-brand-300 bg-steel-800 hover:bg-brand-900/30 border border-steel-700 hover:border-brand-800 px-2 py-0.5 rounded-full transition-colors"
            >
              +{s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
