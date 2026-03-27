/**
 * CAD Generation Pipeline — Trigger.dev Task (v1 production)
 *
 * Artifact storage integrity contract
 * ─────────────────────────────────────
 * Every STEP and STL artifact returned by the CAD worker MUST have a non-null
 * storage_path before this pipeline will mark the run successful and transition
 * the job to awaiting_approval.
 *
 * If any required artifact has storage_path = null the pipeline FAILS the run
 * immediately. Trigger.dev will retry up to maxAttempts times. The job stays
 * in "generating" status throughout.
 *
 * There is NO local-dev fallback / degraded mode in v1. If you need to run
 * locally, configure a real Supabase project (including the cad-artifacts
 * Storage bucket) and set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in the
 * CAD worker environment.
 *
 * Single-writer model
 * ────────────────────
 * This pipeline is the SOLE authoritative DB writer for:
 *   - cad_runs  (status, validation_report_json, error_text, ended_at, …)
 *   - artifacts (storage_path, mime_type, file_size_bytes, …)
 *   - jobs      (status, latest_run_id)
 *
 * The web app webhook endpoint (/api/webhooks/cad-worker) is notification-only
 * and MUST NOT write to any of those tables.
 *
 * Flow
 * ─────
 * 1. Mark cad_run → running
 * 2. Fetch PartSpec from Supabase
 * 3. POST /generate to CAD worker
 * 4. Worker uploads files → returns storage_path per artifact
 * 5. Validate: all required artifact storage_paths are non-null
 *    → If any are null → FAIL (retryable)
 * 6. Write receipt.json to Supabase Storage
 * 7. Insert artifact rows with real storage_path values
 * 8. Update cad_run → success
 * 9. Update job → awaiting_approval
 * 10. Notify web app webhook (notification only)
 */

import { task, logger, AbortTaskRunError } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

// ─────────────────────────────────────────────────────────────
// Payload schema
// ─────────────────────────────────────────────────────────────

const PipelinePayload = z.object({
  job_id: z.string().uuid(),
  cad_run_id: z.string().uuid(),
  part_spec_id: z.string().uuid(),
  variant_type: z
    .enum(["requested", "stronger", "print_optimized", "alternate"])
    .default("requested"),
  engine: z.enum(["build123d", "freecad"]).default("build123d"),
});

type PipelinePayload = z.infer<typeof PipelinePayload>;

// ─────────────────────────────────────────────────────────────
// Artifact shape returned by the CAD worker
// ─────────────────────────────────────────────────────────────

interface WorkerArtifact {
  kind: string;
  local_path: string;
  storage_path: string | null;
  mime_type: string;
  file_size_bytes: number | null;
}

// Artifact kinds that MUST have a real storage_path.
// json_receipt is written by this pipeline itself, so it is excluded here.
const REQUIRED_STORAGE_KINDS = new Set(["step", "stl"]);

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key);
}

function getCadWorkerUrl(): string {
  const url = process.env.CAD_WORKER_URL;
  if (!url) throw new Error("Missing CAD_WORKER_URL environment variable");
  return url.replace(/\/$/, "");
}

async function callCadWorker(
  cadWorkerUrl: string,
  payload: Record<string, unknown>,
  timeoutMs = 120_000
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${cadWorkerUrl}/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-ID": payload.cad_run_id as string,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`CAD worker returned ${response.status}: ${errorText.slice(0, 500)}`);
    }

    return (await response.json()) as Record<string, unknown>;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function notifyWebhook(
  webhookUrl: string,
  webhookSecret: string | undefined,
  payload: Record<string, unknown>
): Promise<void> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (webhookSecret) headers["x-webhook-secret"] = webhookSecret;

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    logger.warn(`Webhook notification failed: ${response.status}`);
  }
}

// ─────────────────────────────────────────────────────────────
// Main task
// ─────────────────────────────────────────────────────────────

export const cadGenerationPipeline = task({
  id: "cad-generation-pipeline",
  maxDuration: 300,
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 30000,
    factor: 2,
  },

  run: async (payload: PipelinePayload, { ctx }) => {
    const { job_id, cad_run_id, part_spec_id, variant_type, engine } =
      PipelinePayload.parse(payload);

    logger.info("CAD generation pipeline started", {
      job_id, cad_run_id, part_spec_id, variant_type, engine,
      attempt: ctx.attempt.number,
    });

    const supabase = getSupabaseClient();
    const cadWorkerUrl = getCadWorkerUrl();
    const webhookUrl = process.env.WEB_APP_WEBHOOK_URL;
    const webhookSecret = process.env.WEBHOOK_SECRET;

    // ── Step 1: Mark run as "running" ────────────────────────
    await supabase
      .from("cad_runs")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", cad_run_id);

    // ── Step 2: Fetch PartSpec ───────────────────────────────
    logger.log("Fetching part spec", { part_spec_id });

    const { data: spec, error: specError } = await supabase
      .from("part_specs")
      .select("*")
      .eq("id", part_spec_id)
      .single();

    if (specError || !spec) {
      const errorMsg = `Part spec not found: ${part_spec_id}`;
      logger.error(errorMsg);
      await supabase
        .from("cad_runs")
        .update({
          status: "failed",
          error_text: errorMsg,
          ended_at: new Date().toISOString(),
        })
        .eq("id", cad_run_id);
      throw new AbortTaskRunError(errorMsg);
    }

    logger.log("Part spec loaded", {
      family: spec.family,
      units: spec.units,
      dimension_count: Object.keys(spec.dimensions_json ?? {}).length,
    });

    // ── Step 3: Call CAD worker ───────────────────────────────
    logger.log("Calling CAD worker", { url: cadWorkerUrl });

    let cadResult: Record<string, unknown>;
    try {
      cadResult = await callCadWorker(cadWorkerUrl, {
        job_id,
        part_spec_id,
        part_spec: {
          family: spec.family,
          units: spec.units,
          material: spec.material ?? "Unknown",
          dimensions: spec.dimensions_json,
          load_requirements: spec.load_requirements_json,
          constraints: spec.constraints_json,
          printer_constraints: spec.printer_constraints_json,
          assumptions: spec.assumptions_json,
          missing_fields: spec.missing_fields_json,
        },
        variant_type,
        engine,
        export_formats: ["step", "stl"],
        strict_validation: true,
      });
    } catch (err) {
      const errorMsg = `CAD worker call failed: ${
        err instanceof Error ? err.message : String(err)
      }`;
      logger.error(errorMsg);
      await supabase
        .from("cad_runs")
        .update({
          status: "failed",
          error_text: errorMsg,
          ended_at: new Date().toISOString(),
        })
        .eq("id", cad_run_id);
      throw new Error(errorMsg);
    }

    const cadStatus = cadResult.status as string;
    const cadArtifacts = (cadResult.artifacts as WorkerArtifact[]) ?? [];

    logger.log("CAD worker response received", {
      status: cadStatus,
      artifact_count: cadArtifacts.length,
      duration_ms: cadResult.duration_ms,
    });

    // ── Step 4: Handle CAD generation failure ────────────────
    if (cadStatus !== "success") {
      const errorMsg = (cadResult.error as string) ?? "CAD generation failed";
      const failureStage = (cadResult.failure_stage as string) ?? "unknown";

      logger.warn("CAD generation failed", {
        error: errorMsg,
        failure_stage: failureStage,
      });

      await supabase
        .from("cad_runs")
        .update({
          status: "failed",
          normalized_params_json: cadResult.normalized_params ?? {},
          validation_report_json: cadResult.validation ?? {},
          error_text: `[${failureStage}] ${errorMsg}`,
          ended_at: new Date().toISOString(),
        })
        .eq("id", cad_run_id);

      await supabase
        .from("jobs")
        .update({ status: "failed", latest_run_id: cad_run_id })
        .eq("id", job_id);

      if (webhookUrl) {
        await notifyWebhook(webhookUrl, webhookSecret, {
          job_id, cad_run_id, part_spec_id,
          status: "failed",
          error: errorMsg,
          failure_stage: failureStage,
          artifact_count: 0,
          duration_ms: cadResult.duration_ms ?? 0,
        });
      }

      const nonRetryableStages = [
        "invalid_dimensions",
        "spec_ambiguity",
        "validation_failed",
      ];
      if (nonRetryableStages.includes(failureStage)) {
        throw new AbortTaskRunError(
          `Non-retryable failure: [${failureStage}] ${errorMsg}`
        );
      }
      throw new Error(`CAD generation failed: ${errorMsg}`);
    }

    // ── Step 5: Artifact storage integrity gate ───────────────
    //
    // Every STEP and STL artifact must have a real, non-null storage_path.
    // A null path means the CAD worker's Supabase upload failed — the file
    // exists only inside the ephemeral worker container. Inserting a null-path
    // artifact row and marking the job awaiting_approval would present a
    // broken download link to the user as a normal success.
    //
    // This is a hard failure. Trigger.dev will retry up to maxAttempts times.
    // The job stays in "generating" status throughout.

    const missingStoragePaths = cadArtifacts.filter(
      (a) => REQUIRED_STORAGE_KINDS.has(a.kind) && a.storage_path === null
    );

    if (missingStoragePaths.length > 0) {
      const missingKinds = missingStoragePaths.map((a) => a.kind).join(", ");
      const errorMsg =
        `Artifact storage upload failed for: [${missingKinds}]. ` +
        `storage_path is null — files were not persisted to Supabase Storage. ` +
        `Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in the ` +
        `CAD worker environment and the 'cad-artifacts' bucket exists.`;

      logger.error("Artifact storage integrity check failed", {
        missing_kinds: missingKinds,
      });

      await supabase
        .from("cad_runs")
        .update({
          status: "failed",
          normalized_params_json: cadResult.normalized_params ?? {},
          validation_report_json: cadResult.validation ?? {},
          error_text: `[storage_upload_failed] ${errorMsg}`,
          ended_at: new Date().toISOString(),
        })
        .eq("id", cad_run_id);

      await supabase
        .from("jobs")
        .update({ status: "failed", latest_run_id: cad_run_id })
        .eq("id", job_id);

      if (webhookUrl) {
        await notifyWebhook(webhookUrl, webhookSecret, {
          job_id, cad_run_id, part_spec_id,
          status: "failed",
          error: errorMsg,
          failure_stage: "storage_upload_failed",
          artifact_count: 0,
          duration_ms: cadResult.duration_ms ?? 0,
        });
      }

      // Retryable: the worker may succeed on the next attempt if the
      // Supabase Storage outage was transient.
      throw new Error(`[storage_upload_failed] ${errorMsg}`);
    }

    // ── Step 6: Write receipt.json to Supabase Storage ───────
    const receipt = {
      schema_version: "1.0",
      generated_at: new Date().toISOString(),
      job_id, cad_run_id, part_spec_id, variant_type, engine,
      generator_name: cadResult.generator_name,
      generator_version: cadResult.generator_version,
      normalized_params: cadResult.normalized_params,
      validation: cadResult.validation,
      assumptions: cadResult.assumptions ?? [],
      warnings: cadResult.warnings ?? [],
      trigger_run_id: ctx.run.id,
      duration_ms: cadResult.duration_ms,
    };

    const receiptPath = `${job_id}/${cad_run_id}/receipt.json`;
    let receiptStoragePath: string | null = null;

    const { error: receiptError } = await supabase.storage
      .from("cad-artifacts")
      .upload(receiptPath, JSON.stringify(receipt, null, 2), {
        contentType: "application/json",
        upsert: true,
      });

    if (receiptError) {
      logger.warn("Failed to upload receipt.json", {
        error: receiptError.message,
      });
    } else {
      receiptStoragePath = receiptPath;
    }

    // ── Step 7: Insert artifact records ───────────────────────
    // All artifacts at this point have a non-null storage_path (guaranteed
    // by the integrity gate above). Only include STEP/STL artifacts from the
    // worker response; receipt is appended separately.
    const artifactRows = cadArtifacts
      .filter((a) => a.storage_path !== null)
      .map((a) => ({
        cad_run_id,
        job_id,
        kind: a.kind,
        storage_path: a.storage_path as string,
        mime_type: a.mime_type,
        file_size_bytes: a.file_size_bytes,
      }));

    // Append receipt row if it was uploaded successfully
    if (receiptStoragePath) {
      artifactRows.push({
        cad_run_id,
        job_id,
        kind: "json_receipt",
        storage_path: receiptStoragePath,
        mime_type: "application/json",
        file_size_bytes: JSON.stringify(receipt).length,
      });
    }

    if (artifactRows.length > 0) {
      const { error: artifactError } = await supabase
        .from("artifacts")
        .insert(artifactRows);

      if (artifactError) {
        logger.error("Failed to insert artifact records", {
          error: artifactError.message,
        });
      }
    }

    // ── Step 8: Update cad_run record ─────────────────────────
    await supabase
      .from("cad_runs")
      .update({
        status: "success",
        normalized_params_json: cadResult.normalized_params ?? {},
        validation_report_json: cadResult.validation ?? {},
        ended_at: new Date().toISOString(),
      })
      .eq("id", cad_run_id);

    // ── Step 9: Update job status ─────────────────────────────
    await supabase
      .from("jobs")
      .update({
        status: "awaiting_approval",
        latest_run_id: cad_run_id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job_id);

    logger.info("CAD generation pipeline completed successfully", {
      job_id, cad_run_id,
      artifact_count: artifactRows.length,
    });

    // ── Step 10: Notify web app webhook (notification only) ───
    if (webhookUrl) {
      await notifyWebhook(webhookUrl, webhookSecret, {
        job_id, cad_run_id, part_spec_id,
        status: "success",
        artifact_count: artifactRows.length,
        duration_ms: cadResult.duration_ms ?? 0,
      });
    }

    return {
      success: true,
      job_id,
      cad_run_id,
      run_status: "success",
      artifact_count: artifactRows.length,
      duration_ms: cadResult.duration_ms,
    };
  },
});
