import { API_BASE_URL } from "../constants";
import type {
  InterpretVoiceRequest,
  InterpretVoiceResponse,
  JobStatusResponse,
  BillingStatus,
  PartSpecDraft,
  Job,
} from "../types";

// ─── HTTP helper ──────────────────────────────────────────────────────────────
async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<T> {
  const { token, ...fetchOptions } = options;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(fetchOptions.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...fetchOptions,
    headers,
  });

  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      errMsg = body.error || body.message || errMsg;
    } catch {}
    const err = new Error(errMsg) as Error & { status: number };
    err.status = res.status;
    throw err;
  }

  return res.json() as Promise<T>;
}

// ─── Voice Interpretation ─────────────────────────────────────────────────────
export async function interpretVoice(
  req: InterpretVoiceRequest,
  token: string
): Promise<InterpretVoiceResponse> {
  return apiFetch<InterpretVoiceResponse>("/api/mobile/interpret-voice", {
    method: "POST",
    body: JSON.stringify(req),
    token,
  });
}

// ─── Job Management ───────────────────────────────────────────────────────────
export async function createJob(
  spec: PartSpecDraft,
  token: string
): Promise<Job> {
  return apiFetch<Job>("/api/mobile/confirm-spec", {
    method: "POST",
    body: JSON.stringify({ spec }),
    token,
  });
}

export async function triggerGeneration(
  jobId: string,
  partSpecId: string,
  token: string
): Promise<{ run_id: string }> {
  return apiFetch<{ run_id: string }>(`/api/jobs/${jobId}/generate`, {
    method: "POST",
    body: JSON.stringify({ part_spec_id: partSpecId }),
    token,
  });
}

export async function getJobStatus(
  jobId: string,
  token: string
): Promise<JobStatusResponse> {
  return apiFetch<JobStatusResponse>(`/api/mobile/job-status?job_id=${jobId}`, {
    method: "GET",
    token,
  });
}

// ─── Billing ──────────────────────────────────────────────────────────────────
export async function getBillingStatus(token: string): Promise<BillingStatus> {
  return apiFetch<BillingStatus>("/api/billing/status", {
    method: "GET",
    token,
  });
}

export async function getCheckoutUrl(
  plan: "maker" | "pro",
  token: string
): Promise<{ url: string }> {
  return apiFetch<{ url: string }>("/api/billing/checkout", {
    method: "POST",
    body: JSON.stringify({ plan }),
    token,
  });
}
