/**
 * Daedalus Gate Protocol — Shared Types
 *
 * Structured proof receipts for the full intake → preview → generate path.
 * Receipts are:
 *   - structured (typed JSON)
 *   - queryable (stored in daedalus_receipts table)
 *   - visible in admin/operator views
 *   - not noisy for end users (hidden by default in UI)
 */

export type DaedalusGate =
  | "intake_interpretation"
  | "harmonia_merge"
  | "clarification"
  | "preview"
  | "vpl"
  | "trust"
  | "generation"
  | "artemis_demo_generation";

export type DaedalusResult = "GO" | "CLARIFY" | "REJECT" | "WARN";

export interface DaedalusReceipt {
  // Identity
  gate: DaedalusGate;
  receipt_id?: string;       // UUID assigned on storage
  session_id?: string;
  job_id?: string;
  user_id?: string;

  // Timing
  timestamp: string;         // ISO 8601
  elapsed_ms: number;

  // Core decision
  result: DaedalusResult;
  confidence?: number;       // 0–1

  // Gate-specific payload (varies by gate)
  payload: Record<string, unknown>;

  // Human-readable notes
  notes: string[];
}

// ── Gate-specific payload shapes ──────────────────────────────────────────────

export interface IntakeInterpretationPayload {
  mode: string;
  family_candidate: string | null;
  extracted_dimensions: Record<string, number>;
  missing_information: string[];
  assistant_message: string;
  preview_strategy: string | null;
  file_count: number;
}

export interface HarmoniaMergePayload {
  inputs_received: string[];
  merge_strategy: string;
  unified_request: string;
  recommended_path: string;
  total_inputs: number;
}

export interface ClarificationPayload {
  questions_asked: string[];
  answers_received: Record<string, string>;
  resolved_fields: string[];
  remaining_missing: string[];
}

export interface PreviewPayload {
  family: string;
  dimensions: Record<string, number>;
  print_time_estimate: string;
  filament_estimate: string;
  orientation: string;
  support_required: boolean;
}

export interface VplPayload {
  score: number;
  grade: string;
  ready_to_print: boolean;
  risk_level: string;
  issues: string[];
}

export interface TrustPayload {
  tier: string;
  marketplace_allowed: boolean;
  library_allowed: boolean;
  keyguardian_priority: string;
}

export interface GenerationPayload {
  family: string;
  engine: string;
  cad_run_id: string;
  trigger_run_id: string | null;
  status: string;
}
