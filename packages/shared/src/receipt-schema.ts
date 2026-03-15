import { z } from "zod";

/**
 * Run Receipt Schema
 * Every CAD generation attempt MUST produce a receipt.json stored in Supabase Storage.
 * This is the single source of truth for what happened in a run.
 */
export const RunReceiptSchema = z.object({
  // Identity
  receipt_version: z.literal("1.0"),
  job_id: z.string().uuid(),
  cad_run_id: z.string().uuid(),
  part_spec_id: z.string().uuid(),
  concept_variant_id: z.string().uuid().optional(),
  git_sha: z.string().optional(),

  // Request summary
  request_summary: z.object({
    title: z.string(),
    transcript_excerpt: z.string(),
    selected_family: z.string(),
    variant_type: z.string(),
    engine: z.string(),
    requested_at: z.string().datetime(),
  }),

  // Normalized dimensions (post unit conversion)
  normalized_dimensions: z.record(z.number()),
  units_normalized_to: z.enum(["mm", "in"]),

  // Assumptions made by AI
  assumptions: z.array(z.string()),

  // Tool calls made during this run
  tool_calls: z.array(
    z.object({
      tool_name: z.string(),
      called_at: z.string().datetime(),
      status: z.enum(["success", "error", "skipped"]),
      duration_ms: z.number().optional(),
    })
  ),

  // CAD engine details
  cad_engine: z.object({
    name: z.string(),
    version: z.string(),
    generator_name: z.string(),
    generator_version: z.string(),
  }),

  // Artifacts produced (ONLY populated when CAD worker returns success)
  artifacts: z.array(
    z.object({
      artifact_id: z.string().uuid(),
      kind: z.enum(["step", "stl", "png", "json_receipt", "transcript", "prompt", "log"]),
      storage_path: z.string(),
      mime_type: z.string(),
      file_size_bytes: z.number().optional(),
    })
  ),

  // Validation report
  validation: z.object({
    bounding_box_ok: z.boolean(),
    wall_thickness_ok: z.boolean(),
    units_ok: z.boolean(),
    printability_score: z.number().min(0).max(1),
    warnings: z.array(z.string()),
    errors: z.array(z.string()),
  }).optional(),

  // Approval state
  approval: z.object({
    required: z.boolean(),
    approval_id: z.string().uuid().optional(),
    decision: z.enum(["approved", "rejected", "revision_requested", "pending"]).optional(),
    decided_at: z.string().datetime().optional(),
  }),

  // Print result (populated after printing)
  print_result: z.object({
    print_result_id: z.string().uuid(),
    outcome: z.enum(["success", "partial", "fail"]),
    fit_score: z.number().optional(),
    strength_score: z.number().optional(),
    surface_score: z.number().optional(),
    issue_tags: z.array(z.string()),
  }).optional(),

  // Run status and timing
  status: z.enum(["queued", "running", "success", "failed"]),
  failure_stage: z.enum([
    "spec_ambiguity",
    "invalid_dimensions",
    "generator_exception",
    "export_exception",
    "validation_failed",
  ]).optional(),
  failure_message: z.string().optional(),

  // Timestamps
  started_at: z.string().datetime(),
  ended_at: z.string().datetime().optional(),
  total_duration_ms: z.number().optional(),
});

export type RunReceipt = z.infer<typeof RunReceiptSchema>;

/**
 * Creates an empty receipt shell. Populate fields as the run progresses.
 * IMPORTANT: Do NOT mark status as 'success' until the CAD worker confirms success.
 */
export function createReceiptShell(params: {
  job_id: string;
  cad_run_id: string;
  part_spec_id: string;
  title: string;
  transcript_excerpt: string;
  selected_family: string;
  variant_type: string;
  engine: string;
  git_sha?: string;
}): Partial<RunReceipt> {
  return {
    receipt_version: "1.0",
    job_id: params.job_id,
    cad_run_id: params.cad_run_id,
    part_spec_id: params.part_spec_id,
    git_sha: params.git_sha,
    request_summary: {
      title: params.title,
      transcript_excerpt: params.transcript_excerpt,
      selected_family: params.selected_family,
      variant_type: params.variant_type,
      engine: params.engine,
      requested_at: new Date().toISOString(),
    },
    normalized_dimensions: {},
    units_normalized_to: "mm",
    assumptions: [],
    tool_calls: [],
    cad_engine: {
      name: params.engine,
      version: "unknown",
      generator_name: "unknown",
      generator_version: "1.0.0",
    },
    artifacts: [], // NEVER pre-populate with fake paths
    approval: {
      required: false,
    },
    status: "queued",
    started_at: new Date().toISOString(),
  };
}
