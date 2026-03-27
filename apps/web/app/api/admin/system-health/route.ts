/**
 * GET /api/admin/system-health
 * Returns the health status of all backend services.
 * Polled every 30s by the dashboard status bar.
 */
import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface ServiceStatus {
  status: "online" | "offline" | "configured" | "not_configured" | "connected" | "error" | "accessible" | "inaccessible";
  latency_ms?: number;
  detail?: string;
}

interface HealthResponse {
  cad_worker: ServiceStatus;
  trigger: ServiceStatus;
  supabase: ServiceStatus;
  storage: ServiceStatus;
  checked_at: string;
}

async function checkCadWorker(): Promise<ServiceStatus> {
  const url = process.env.CAD_WORKER_URL;
  if (!url) return { status: "offline", detail: "CAD_WORKER_URL not set" };
  try {
    const start = Date.now();
    const res = await fetch(`${url}/health`, {
      signal: AbortSignal.timeout(5000),
      headers: process.env.CAD_WORKER_API_KEY
        ? { "X-API-Key": process.env.CAD_WORKER_API_KEY }
        : {},
    });
    const latency_ms = Date.now() - start;
    if (!res.ok) return { status: "offline", latency_ms, detail: `HTTP ${res.status}` };
    const data = await res.json();
    return {
      status: data.status === "ok" ? "online" : "offline",
      latency_ms,
      detail: data.engines ? JSON.stringify(data.engines) : undefined,
    };
  } catch (err) {
    return { status: "offline", detail: String(err) };
  }
}

async function checkTrigger(): Promise<ServiceStatus> {
  const key = process.env.TRIGGER_SECRET_KEY;
  if (!key) return { status: "not_configured", detail: "TRIGGER_SECRET_KEY not set" };
  return { status: "configured", detail: "TRIGGER_SECRET_KEY present" };
}

async function checkSupabase(): Promise<ServiceStatus> {
  try {
    const supabase = await createClient();
    const start = Date.now();
    const { error } = await supabase.from("jobs").select("id").limit(1);
    const latency_ms = Date.now() - start;
    if (error) return { status: "error", latency_ms, detail: error.message };
    return { status: "connected", latency_ms };
  } catch (err) {
    return { status: "error", detail: String(err) };
  }
}

async function checkStorage(): Promise<ServiceStatus> {
  try {
    // Must use service role client — getBucket() requires service_role, not anon key
    const supabase = await createServiceClient();
    const { data, error } = await supabase.storage.getBucket("cad-artifacts");
    if (error) return { status: "inaccessible", detail: error.message };
    return { status: data ? "accessible" : "inaccessible" };
  } catch (err) {
    return { status: "inaccessible", detail: String(err) };
  }
}

export async function GET() {
  const [cad_worker, trigger, supabase, storage] = await Promise.all([
    checkCadWorker(),
    checkTrigger(),
    checkSupabase(),
    checkStorage(),
  ]);

  const health: HealthResponse = {
    cad_worker,
    trigger,
    supabase,
    storage,
    checked_at: new Date().toISOString(),
  };

  return NextResponse.json(health);
}
