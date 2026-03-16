/**
 * AI4U Little Engineer — Web App TypeScript Types
 * These mirror the database schema (v3) and shared package types.
 *
 * v3 additions (degraded-mode repair):
 *   - JobStatus: added 'awaiting_approval_local'
 *   - CadRunStatus: added 'degraded_local'
 *   - Artifact.local_only: boolean flag — when true, no Supabase Storage upload
 *     occurred and the UI MUST NOT show a download button.
 *   - Artifact.storage_path: now string | null (null only when local_only=true)
 */

export type JobStatus =
  | "draft"
  | "clarifying"
  | "generating"
  | "awaiting_approval"
  | "awaiting_approval_local" // degraded/local-dev mode only — ALLOW_LOCAL_ARTIFACT_PATHS=true
  | "approved"
  | "rejected"
  | "printed"
  | "failed";

export type CadRunStatus =
  | "queued"
  | "running"
  | "success"
  | "degraded_local" // ALLOW_LOCAL_ARTIFACT_PATHS=true — artifacts not in Storage
  | "failed";

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

/** Returns true when a job is in a degraded/local-dev state. */
export function isLocalOnlyJobStatus(status: JobStatus): boolean {
  return status === "awaiting_approval_local";
}

/** Returns true when a CAD run is in a degraded/local-dev state. */
export function isLocalOnlyRunStatus(status: CadRunStatus): boolean {
  return status === "degraded_local";
}

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

export interface PartSpec {
  id: string;
  job_id: string;
  version: number;
  units: Units;
  family: PartFamily;
  material: string | null;
  dimensions_json: Record<string, number>;
  load_requirements_json: Record<string, unknown>;
  constraints_json: Record<string, unknown>;
  printer_constraints_json: Record<string, unknown>;
  assumptions_json: string[];
  missing_fields_json: string[];
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
  score_json: {
    printability?: number;
    strength?: number;
    material_efficiency?: number;
  };
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
  normalized_params_json: Record<string, unknown>;
  validation_report_json: ValidationReport;
  error_text: string | null;
  started_at: string | null;
  ended_at: string | null;
}

export interface ValidationReport {
  bounding_box_ok: boolean;
  wall_thickness_ok: boolean;
  units_ok: boolean;
  printability_score: number;
  bounding_box_mm?: number[];
  min_wall_thickness_mm?: number;
  warnings: string[];
  errors: string[];
}

export interface Artifact {
  id: string;
  cad_run_id: string;
  job_id: string;
  kind: "step" | "stl" | "png" | "json_receipt" | "transcript" | "prompt" | "log";
  /**
   * Nullable when local_only=true (ALLOW_LOCAL_ARTIFACT_PATHS=true degraded mode).
   * In production this is always a non-null Supabase Storage path.
   */
  storage_path: string | null;
  mime_type: string;
  file_size_bytes: number | null;
  /**
   * When true, the file was never uploaded to Supabase Storage.
   * The UI MUST NOT render a download button for local-only artifacts.
   */
  local_only: boolean;
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

export interface VoiceTurn {
  id: string;
  session_id: string;
  job_id: string | null;
  speaker: "user" | "assistant";
  transcript_text: string;
  audio_url: string | null;
  created_at: string;
}

export interface JobDetail extends Job {
  part_specs?: PartSpec[];
  concept_variants?: ConceptVariant[];
  cad_runs?: CadRun[];
  artifacts?: Artifact[];
  approvals?: Approval[];
  print_results?: PrintResult[];
  voice_turns?: VoiceTurn[];
}

// API response types
export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
}

// Voice session types
export interface VoiceSessionConfig {
  session_id: string;
  gemini_session_token: string;
  job_id: string | null;
}

// Generation request/result
export interface GenerateRequest {
  job_id: string;
  part_spec_id: string;
  variant_type: VariantType;
  engine?: CadEngine;
}

export interface GenerateResult {
  cad_run_id: string;
  trigger_job_id: string;
  status: "queued";
}
