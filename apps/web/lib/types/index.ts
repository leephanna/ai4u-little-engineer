/**
 * AI4U Little Engineer — Web App TypeScript Types
 * Mirrors the database schema (v4 — Option A, degraded mode removed).
 *
 * v4 changes:
 *   - Removed 'awaiting_approval_local' from JobStatus.
 *   - Removed 'degraded_local' from CadRunStatus.
 *   - Removed Artifact.local_only field.
 *   - Reverted Artifact.storage_path to string (not nullable).
 *   - Removed isLocalOnlyJobStatus / isLocalOnlyRunStatus helpers.
 *
 * Artifact storage contract:
 *   Every artifact row in the database has a non-null storage_path.
 *   The Trigger.dev pipeline enforces this at Step 5 before inserting
 *   any artifact rows. If storage_path would be null, the run fails.
 */

export type JobStatus =
  | "draft"
  | "clarifying"
  | "generating"
  | "awaiting_approval"
  | "approved"
  | "rejected"
  | "printed"
  | "completed"   // Artemis II and demo jobs land here
  | "failed";

export type CadRunStatus = "queued" | "running" | "success" | "failed";

export type PartFamily =
  | "spacer"
  | "flat_bracket"
  | "l_bracket"
  | "u_bracket"
  | "hole_plate"
  | "standoff_block"
  | "cable_clip"
  | "enclosure"
  | "adapter_bushing"
  | "simple_jig";

export type VariantType = "requested" | "stronger" | "print_optimized" | "alternate";
export type CadEngine = "build123d" | "freecad";
export type Units = "mm" | "in";

export interface Job {
  id: string;
  user_id: string;
  session_id: string | null;
  title: string;
  status: JobStatus;
  requested_family: PartFamily | null;
  selected_family: PartFamily | null;
  confidence_score: number | null;
  latest_spec_version: number;
  latest_run_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Session {
  id: string;
  user_id: string;
  device_id: string | null;
  started_at: string;
  ended_at: string | null;
  transcript_summary: string | null;
}

export interface VoiceTurn {
  id: string;
  session_id: string;
  job_id: string | null;
  speaker: "user" | "assistant";
  transcript_text: string;
  audio_url: string | null;
  created_at: string;
}

export interface PartSpec {
  id: string;
  job_id: string;
  version: number;
  units: Units;
  family: PartFamily;
  material: string | null;
  dimensions_json: Record<string, unknown>;
  load_requirements_json: Record<string, unknown>;
  constraints_json: Record<string, unknown>;
  printer_constraints_json: Record<string, unknown>;
  assumptions_json: string[];
  missing_fields_json: string[];
  source_transcript_span_json: Record<string, unknown> | null;
  created_by: "ai" | "user" | "hybrid";
  created_at: string;
}

export interface ConceptVariant {
  id: string;
  job_id: string;
  part_spec_id: string;
  variant_type: VariantType;
  description: string | null;
  rationale: string | null;
  score_json: Record<string, unknown>;
  created_at: string;
}

export interface CadRun {
  id: string;
  job_id: string;
  part_spec_id: string;
  concept_variant_id: string | null;
  engine: CadEngine;
  generator_name: string;
  generator_version: string;
  status: CadRunStatus;
  source_code: string | null;
  normalized_params_json: Record<string, unknown>;
  validation_report_json: Record<string, unknown>;
  error_text: string | null;
  started_at: string | null;
  ended_at: string | null;
}

export interface Artifact {
  id: string;
  cad_run_id: string;
  job_id: string;
  kind: "step" | "stl" | "png" | "json_receipt" | "transcript" | "prompt" | "log";
  /** Always non-null. The Trigger.dev pipeline guarantees this before inserting. */
  storage_path: string;
  mime_type: string;
  file_size_bytes: number | null;
  created_at: string;
}

export interface Approval {
  id: string;
  job_id: string;
  cad_run_id: string;
  reviewer_user_id: string | null;
  decision: "approved" | "rejected" | "revision_requested";
  notes: string | null;
  decided_at: string;
}

export interface PrintResult {
  id: string;
  job_id: string;
  cad_run_id: string;
  printer_name: string | null;
  slicer_name: string | null;
  material: string | null;
  layer_height: number | null;
  nozzle_size: number | null;
  infill_percent: number | null;
  orientation_notes: string | null;
  outcome: "success" | "partial" | "fail";
  fit_score: number | null;
  strength_score: number | null;
  surface_score: number | null;
  issue_tags: string[];
  notes: string | null;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────
// UI helpers
// ─────────────────────────────────────────────────────────────

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  draft: "Draft",
  clarifying: "Clarifying",
  generating: "Generating",
  awaiting_approval: "Ready to Review",
  approved: "Approved",
  rejected: "Rejected",
  printed: "Printed",
  completed: "Completed",
  failed: "Failed",
};

export const JOB_STATUS_COLORS: Record<JobStatus, string> = {
  draft: "bg-gray-100 text-gray-700",
  clarifying: "bg-blue-100 text-blue-700",
  generating: "bg-yellow-100 text-yellow-700",
  awaiting_approval: "bg-purple-100 text-purple-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  printed: "bg-teal-100 text-teal-700",
  completed: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-700",
};

export const CAD_RUN_STATUS_LABELS: Record<CadRunStatus, string> = {
  queued: "Queued",
  running: "Running",
  success: "Success",
  failed: "Failed",
};

export const CAD_RUN_STATUS_COLORS: Record<CadRunStatus, string> = {
  queued: "bg-gray-100 text-gray-600",
  running: "bg-yellow-100 text-yellow-700",
  success: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

/**
 * Validation report returned by the CAD worker and stored in
 * cad_runs.validation_report_json.
 */
export interface ValidationReport {
  printability_score: number | null;
  bounding_box_ok: boolean;
  wall_thickness_ok: boolean;
  units_ok: boolean;
  bounding_box_mm: [number, number, number] | null;
  warnings: string[];
  errors: string[];
}

/** Returns true when a job is in a terminal (non-recoverable) state. */
export function isTerminalJobStatus(status: JobStatus): boolean {
  return status === "printed" || status === "rejected" || status === "completed";
}

/** Returns true when a job is actively being processed. */
export function isActiveJobStatus(status: JobStatus): boolean {
  return status === "clarifying" || status === "generating";
}
