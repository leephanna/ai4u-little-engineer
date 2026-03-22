"use client";

export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-steel-900">
      <header className="border-b border-steel-800 px-4 sm:px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">AI</span>
          </div>
          <span className="font-semibold text-steel-100">Little Engineer</span>
        </div>
        <div className="w-20 h-4 bg-steel-700 rounded animate-pulse" />
      </header>
      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Stats skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card text-center animate-pulse">
              <div className="w-8 h-8 bg-steel-700 rounded mx-auto mb-2" />
              <div className="w-12 h-8 bg-steel-700 rounded mx-auto mb-1" />
              <div className="w-16 h-3 bg-steel-700 rounded mx-auto" />
            </div>
          ))}
        </div>
        {/* Quick actions skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card animate-pulse py-4">
              <div className="w-8 h-8 bg-steel-700 rounded mx-auto mb-2" />
              <div className="w-20 h-3 bg-steel-700 rounded mx-auto" />
            </div>
          ))}
        </div>
        {/* Job list skeleton */}
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card animate-pulse">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-steel-700 rounded flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="w-48 h-4 bg-steel-700 rounded" />
                  <div className="w-24 h-3 bg-steel-700 rounded" />
                </div>
                <div className="w-16 h-5 bg-steel-700 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
