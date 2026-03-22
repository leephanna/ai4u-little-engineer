"use client";

import { useEffect, useState } from "react";

interface ServiceStatus {
  status: string;
  latency_ms?: number;
  detail?: string;
}

interface HealthData {
  cad_worker: ServiceStatus;
  trigger: ServiceStatus;
  supabase: ServiceStatus;
  storage: ServiceStatus;
  checked_at: string;
}

function StatusDot({ status }: { status: string }) {
  const isGood = ["online", "configured", "connected", "accessible"].includes(status);
  const isWarn = ["not_configured"].includes(status);
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full mr-1.5 ${
        isGood ? "bg-green-400" : isWarn ? "bg-yellow-400" : "bg-red-400"
      }`}
    />
  );
}

function StatusLabel({ status }: { status: string }) {
  const labels: Record<string, string> = {
    online: "Online",
    offline: "Offline",
    configured: "Configured",
    not_configured: "Not Configured",
    connected: "Connected",
    error: "Error",
    accessible: "Accessible",
    inaccessible: "Inaccessible",
  };
  return <span>{labels[status] ?? status}</span>;
}

export function SystemStatusBar() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchHealth() {
    try {
      const res = await fetch("/api/admin/system-health");
      if (res.ok) setHealth(await res.json());
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 30_000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="bg-steel-800/60 border border-steel-700 rounded-xl px-4 py-3 mb-6 flex items-center gap-2 text-steel-400 text-xs">
        <span className="animate-pulse">Checking system status…</span>
      </div>
    );
  }

  if (!health) return null;

  const services = [
    { label: "CAD Worker", data: health.cad_worker },
    { label: "Trigger.dev", data: health.trigger },
    { label: "Supabase", data: health.supabase },
    { label: "Storage", data: health.storage },
  ];

  return (
    <div className="bg-steel-800/60 border border-steel-700 rounded-xl px-4 py-3 mb-6">
      <div className="flex flex-wrap gap-4 items-center">
        <span className="text-xs font-semibold text-steel-400 uppercase tracking-wide">
          System
        </span>
        {services.map(({ label, data }) => (
          <div key={label} className="flex items-center text-xs text-steel-300">
            <StatusDot status={data.status} />
            <span className="text-steel-400 mr-1">{label}:</span>
            <StatusLabel status={data.status} />
            {data.latency_ms !== undefined && (
              <span className="text-steel-500 ml-1">({data.latency_ms}ms)</span>
            )}
          </div>
        ))}
        <span className="text-xs text-steel-600 ml-auto">
          Updated {new Date(health.checked_at).toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
}
