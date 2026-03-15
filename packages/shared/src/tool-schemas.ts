import { z } from "zod";
import { PART_FAMILIES, VARIANT_TYPES, CAD_ENGINES, SUPPORTED_UNITS } from "./part-families";

// ─────────────────────────────────────────────────────────────
// Tool: create_job
// ─────────────────────────────────────────────────────────────
export const CreateJobInputSchema = z.object({
  title: z.string().min(1).max(200),
  initial_transcript: z.string().min(1),
  session_id: z.string().uuid().optional(),
});

export const CreateJobOutputSchema = z.object({
  job_id: z.string().uuid(),
});

// ─────────────────────────────────────────────────────────────
// Tool: extract_part_spec
// ─────────────────────────────────────────────────────────────
export const ExtractPartSpecInputSchema = z.object({
  job_id: z.string().uuid(),
  transcript: z.string().min(1),
  prior_context_ids: z.array(z.string().uuid()).optional().default([]),
});

export const ExtractPartSpecOutputSchema = z.object({
  part_spec_draft: z.record(z.unknown()),
  confidence_score: z.number().min(0).max(1),
  missing_fields: z.array(z.string()),
  candidate_families: z.array(z.enum(PART_FAMILIES)),
});

// ─────────────────────────────────────────────────────────────
// Tool: ask_missing_questions
// ─────────────────────────────────────────────────────────────
export const AskMissingQuestionsInputSchema = z.object({
  part_spec_draft: z.record(z.unknown()),
  missing_fields: z.array(z.string()),
});

export const AskMissingQuestionsOutputSchema = z.object({
  questions: z.array(
    z.object({
      field: z.string(),
      question: z.string(),
      hint: z.string().optional(),
    })
  ),
});

// ─────────────────────────────────────────────────────────────
// Tool: select_part_family
// ─────────────────────────────────────────────────────────────
export const SelectPartFamilyInputSchema = z.object({
  part_spec_draft: z.record(z.unknown()),
  candidate_families: z.array(z.enum(PART_FAMILIES)),
});

export const SelectPartFamilyOutputSchema = z.object({
  selected_family: z.enum(PART_FAMILIES),
  rationale: z.string(),
});

// ─────────────────────────────────────────────────────────────
// Tool: retrieve_similar_jobs
// ─────────────────────────────────────────────────────────────
export const RetrieveSimilarJobsInputSchema = z.object({
  query_text: z.string().min(1),
  family: z.enum(PART_FAMILIES).optional(),
  top_k: z.number().int().min(1).max(20).default(5),
});

export const RetrieveSimilarJobsOutputSchema = z.object({
  similar_jobs: z.array(
    z.object({
      job_id: z.string().uuid(),
      title: z.string(),
      similarity_score: z.number(),
      family: z.string(),
      outcome: z.string().optional(),
    })
  ),
  recommended_defaults: z.record(z.unknown()),
});

// ─────────────────────────────────────────────────────────────
// Tool: generate_concepts
// ─────────────────────────────────────────────────────────────
export const GenerateConceptsInputSchema = z.object({
  part_spec: z.record(z.unknown()),
  prior_print_outcomes: z.array(z.record(z.unknown())).optional().default([]),
});

export const GenerateConceptsOutputSchema = z.object({
  variants: z.array(
    z.object({
      variant_type: z.enum(VARIANT_TYPES),
      description: z.string(),
      rationale: z.string(),
      modified_dimensions: z.record(z.unknown()).optional(),
      score: z.object({
        printability: z.number().min(0).max(1),
        strength: z.number().min(0).max(1),
        material_efficiency: z.number().min(0).max(1),
      }),
    })
  ),
});

// ─────────────────────────────────────────────────────────────
// Tool: generate_cad
// ─────────────────────────────────────────────────────────────
export const GenerateCadInputSchema = z.object({
  part_spec_id: z.string().uuid(),
  variant_type: z.enum(VARIANT_TYPES),
  engine: z.enum(CAD_ENGINES).default("build123d"),
  export_formats: z.array(z.enum(["step", "stl"])).default(["step", "stl"]),
  preview: z.boolean().default(true),
});

export const GenerateCadOutputSchema = z.object({
  cad_run_id: z.string().uuid(),
  status: z.enum(["queued", "running", "success", "failed"]),
});

// ─────────────────────────────────────────────────────────────
// Tool: validate_geometry
// ─────────────────────────────────────────────────────────────
export const ValidateGeometryInputSchema = z.object({
  cad_run_id: z.string().uuid(),
});

export const ValidateGeometryOutputSchema = z.object({
  validation_report: z.object({
    bounding_box_ok: z.boolean(),
    wall_thickness_ok: z.boolean(),
    units_ok: z.boolean(),
    printability_score: z.number().min(0).max(1),
    warnings: z.array(z.string()),
    errors: z.array(z.string()),
  }),
});

// ─────────────────────────────────────────────────────────────
// Tool: store_artifacts
// ─────────────────────────────────────────────────────────────
export const StoreArtifactsInputSchema = z.object({
  cad_run_id: z.string().uuid(),
  files: z.array(
    z.object({
      kind: z.enum(["step", "stl", "png", "json_receipt", "transcript", "prompt", "log"]),
      local_path: z.string(),
      mime_type: z.string(),
    })
  ),
});

export const StoreArtifactsOutputSchema = z.object({
  artifact_ids: z.array(z.string().uuid()),
});

// ─────────────────────────────────────────────────────────────
// Tool: request_approval
// ─────────────────────────────────────────────────────────────
export const RequestApprovalInputSchema = z.object({
  job_id: z.string().uuid(),
  cad_run_id: z.string().uuid(),
  summary: z.string(),
});

export const RequestApprovalOutputSchema = z.object({
  approval_id: z.string().uuid(),
});

// ─────────────────────────────────────────────────────────────
// Tool: record_print_result
// ─────────────────────────────────────────────────────────────
export const RecordPrintResultInputSchema = z.object({
  cad_run_id: z.string().uuid(),
  print_result_json: z.object({
    printer_name: z.string().optional(),
    slicer_name: z.string().optional(),
    material: z.string().optional(),
    layer_height: z.number().optional(),
    nozzle_size: z.number().optional(),
    infill_percent: z.number().optional(),
    orientation_notes: z.string().optional(),
    outcome: z.enum(["success", "partial", "fail"]),
    fit_score: z.number().min(0).max(1).optional(),
    strength_score: z.number().min(0).max(1).optional(),
    surface_score: z.number().min(0).max(1).optional(),
    issue_tags: z.array(z.string()).optional().default([]),
    notes: z.string().optional(),
  }),
});

export const RecordPrintResultOutputSchema = z.object({
  print_result_id: z.string().uuid(),
  learning_event_id: z.string().uuid(),
});

// ─────────────────────────────────────────────────────────────
// Tool: update_learning_memory
// ─────────────────────────────────────────────────────────────
export const UpdateLearningMemoryInputSchema = z.object({
  job_id: z.string().uuid(),
  event_payload: z.record(z.unknown()),
});

export const UpdateLearningMemoryOutputSchema = z.object({
  memory_ids: z.array(z.string().uuid()),
});

// ─────────────────────────────────────────────────────────────
// Gemini function calling tool definitions
// ─────────────────────────────────────────────────────────────
export const GEMINI_TOOL_DEFINITIONS = [
  {
    name: "create_job",
    description: "Creates a new CAD job shell from the initial user transcript.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short descriptive title for the part" },
        initial_transcript: { type: "string", description: "The user's initial voice transcript" },
        session_id: { type: "string", description: "Current session UUID" },
      },
      required: ["title", "initial_transcript"],
    },
  },
  {
    name: "extract_part_spec",
    description: "Extracts a structured PartSpec from the transcript and context.",
    parameters: {
      type: "object",
      properties: {
        job_id: { type: "string" },
        transcript: { type: "string" },
        prior_context_ids: { type: "array", items: { type: "string" } },
      },
      required: ["job_id", "transcript"],
    },
  },
  {
    name: "ask_missing_questions",
    description: "Returns only the shortest list of questions needed to fill missing critical fields.",
    parameters: {
      type: "object",
      properties: {
        part_spec_draft: { type: "object" },
        missing_fields: { type: "array", items: { type: "string" } },
      },
      required: ["part_spec_draft", "missing_fields"],
    },
  },
  {
    name: "select_part_family",
    description: "Selects the best matching supported part family.",
    parameters: {
      type: "object",
      properties: {
        part_spec_draft: { type: "object" },
        candidate_families: { type: "array", items: { type: "string" } },
      },
      required: ["part_spec_draft", "candidate_families"],
    },
  },
  {
    name: "retrieve_similar_jobs",
    description: "Retrieves semantically similar prior jobs to inform defaults.",
    parameters: {
      type: "object",
      properties: {
        query_text: { type: "string" },
        family: { type: "string" },
        top_k: { type: "number" },
      },
      required: ["query_text"],
    },
  },
  {
    name: "generate_concepts",
    description: "Generates requested, stronger, print-optimized, and alternate concept variants.",
    parameters: {
      type: "object",
      properties: {
        part_spec: { type: "object" },
        prior_print_outcomes: { type: "array" },
      },
      required: ["part_spec"],
    },
  },
  {
    name: "generate_cad",
    description: "Dispatches the CAD worker to generate STEP and STL files.",
    parameters: {
      type: "object",
      properties: {
        part_spec_id: { type: "string" },
        variant_type: { type: "string", enum: ["requested", "stronger", "print_optimized", "alternate"] },
        engine: { type: "string", enum: ["build123d", "freecad"] },
        export_formats: { type: "array", items: { type: "string" } },
        preview: { type: "boolean" },
      },
      required: ["part_spec_id", "variant_type"],
    },
  },
  {
    name: "request_approval",
    description: "Pauses the workflow and requests human approval before releasing the design.",
    parameters: {
      type: "object",
      properties: {
        job_id: { type: "string" },
        cad_run_id: { type: "string" },
        summary: { type: "string" },
      },
      required: ["job_id", "cad_run_id", "summary"],
    },
  },
  {
    name: "record_print_result",
    description: "Records the real-world print outcome for a completed job.",
    parameters: {
      type: "object",
      properties: {
        cad_run_id: { type: "string" },
        print_result_json: { type: "object" },
      },
      required: ["cad_run_id", "print_result_json"],
    },
  },
];
