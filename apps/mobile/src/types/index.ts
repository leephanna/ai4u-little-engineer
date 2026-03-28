import type { MvpPartFamily, Units } from "../constants";

// ─── Auth ─────────────────────────────────────────────────────────────────────
export interface AuthUser {
  id: string;
  email: string;
  accessToken: string;
  refreshToken: string;
}

// ─── Part Spec ────────────────────────────────────────────────────────────────
export interface PartSpecDraft {
  family: MvpPartFamily | null;
  dimensions: Record<string, number>;
  units: Units;
  material?: string;
  notes?: string;
}

// ─── Conversation ─────────────────────────────────────────────────────────────
export type ConversationState =
  | "IDLE"
  | "LISTENING"
  | "TRANSCRIBING"
  | "INTERPRETING"
  | "ASKING_FOR_MISSING_FIELDS"
  | "REVIEWING_SPEC"
  | "CONFIRMING_GENERATION"
  | "GENERATING"
  | "SHOWING_RESULTS"
  | "ERROR_RECOVERY";

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
  isVoice?: boolean;
}

// ─── Interpret Voice API ──────────────────────────────────────────────────────
export interface InterpretVoiceRequest {
  transcript: string;
  current_spec?: PartSpecDraft;
  conversation_history?: Array<{ role: string; text: string }>;
}

export interface InterpretVoiceResponse {
  intent: "create_part" | "edit_dimension" | "confirm" | "cancel" | "repeat" | "unknown";
  family: MvpPartFamily | null;
  dimensions: Record<string, number>;
  missing_fields: string[];
  units: Units;
  summary_text: string;
  next_question: string | null;
  confidence: number;
  warnings: string[];
}

// ─── Job / Generation ─────────────────────────────────────────────────────────
export type JobStatus =
  | "draft"
  | "clarifying"
  | "generating"
  | "awaiting_approval"
  | "approved"
  | "rejected"
  | "printed"
  | "failed";

export interface Artifact {
  id: string;
  file_format: string;
  storage_path: string;
  file_size_bytes: number;
  variant_type: string;
}

export interface Job {
  id: string;
  status: JobStatus;
  family: string;
  dimensions: Record<string, number>;
  units: string;
  created_at: string;
  updated_at: string;
  artifacts?: Artifact[];
  error_message?: string;
}

export interface JobStatusResponse {
  job: Job;
  artifacts: Artifact[];
  download_urls: Record<string, string>;
}

// ─── Billing ──────────────────────────────────────────────────────────────────
export type PlanId = "free" | "maker" | "pro";

export interface BillingStatus {
  plan: PlanId;
  generations_this_month: number;
  generations_limit: number | null;
  can_generate: boolean;
  upgrade_url?: string;
}
