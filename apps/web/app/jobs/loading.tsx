"use client";

export default function JobsLoading() {
  return (
    <div className="min-h-screen bg-steel-900 flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 bg-brand-600 rounded-xl flex items-center justify-center mx-auto mb-4 animate-pulse">
          <span className="text-white font-bold text-lg">⚙️</span>
        </div>
        <p className="text-steel-400 text-sm">Loading job…</p>
      </div>
    </div>
  );
}
