/**
 * CAD Generation Pipeline — Trigger.dev Task
 *
 * Artifact storage integrity contract
 * ─────────────────────────────────────
 * Every STEP and STL artifact returned by the CAD worker MUST have a non-null
 * storage_path before this pipeline will mark the run as successful and
 * transition the job to awaiting_approval.
 *
 * If any required artifact has storage_path = null the pipeline FAILS the run
 * and does NOT insert artifact rows or advance the job status, UNLESS the
 * environment variable ALLOW_LOCAL_ARTIFACT_PATHS=true is explicitly set.
 *
 * ALLOW_LOCAL_ARTIFACT_PATHS=true (local-dev only)
 * ─────────────────────────────────────────────────
 * When this flag is set the run is marked "degraded_local" (not "success"),
 * the job is set to "awaiting_approval_local" (not "awaiting_approval"), and
 * every artifact row is inserted with a local_only=true flag so the UI can
 * display a clear "local dev — no download available" warning instead of
 * presenting a broken download link as a normal success.
 *
 * Flow (production)
 * ─────────────────
 * 1. Mark cad_run → running
 * 2. Fetch PartSpec from Supabase
 * 3. POST /generate to CAD worker
 * 4. Worker uploads files → returns storage_path per artifact
 * 5. Validate: all required artifact storage_paths are non-null
 *    → If any are null and ALLOW_LOCAL_ARTIFACT_PATHS≠true → FAIL
 * 6. Write receipt.json to Supabase Storage
 * 7. Insert artifact rows with real storage_path values
 * 8. Update cad_run → success
 * 9. Update job → awaiting_approval
 * 10. Notify web app webhook
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

// Artifact kinds that MUST have a real storage_path in production.
// json_receipt is written by this pipeline itself, so it is excluded here.
const REQUIRED_STORAGE_KINDS = new Set(["step", "stl"]);

// ─────────────────────────────────────────────────────────────
// Environment helpers
// ─────────────────────────────────────────────────────────────

function isLocalArtifactPathsAllowed(): boolean {
  return process.env.ALLOW_LOCAL_ARTIFACT_PATHS === "true";
}

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

    const allowLocalPaths = isLocalArtifactPathsAllowed();

    logger.info("CAD generation pipeline started", {
      job_id, cad_run_id, part_spec_id, variant_type, engine,
      attempt: ctx.attempt.number,
      allow_local_artifact_paths: allowLocalPaths,
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
          material: spec.material,
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
          artifacts: [],
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

    // ── Step 5: Validate storage_path integrity ───────────────
    //
    // This is the integrity gate. Every STEP and STL artifact must have a
    // real, non-null storage_path. A null path means the CAD worker's
    // Supabase upload failed — the file exists only inside the worker
    // container, which is ephemeral. Inserting a null-path artifact row
    // and marking the job awaiting_approval would present a broken download
    // link to the user as if it were a normal success.
    //
    // Production (ALLOW_LOCAL_ARTIFACT_PATHS unset or false):
    //   → Fail the run immediately. The job stays in "generating" status.
    //   → Trigger.dev will retry up to maxAttempts times.
    //
    // Local dev (ALLOW_LOCAL_ARTIFACT_PATHS=true):
    //   → Mark the run "degraded_local" and the job "awaiting_approval_local".
    //   → Insert artifact rows with local_only=true.
    //   → The UI must display a "local dev — no download available" warning.

    const missingStoragePaths = cadArtifacts.filter(
      (a) => REQUIRED_STORAGE_KINDS.has(a.kind) && a.storage_path === null
    );

    if (missingStoragePaths.length > 0) {
      const missingKinds = missingStoragePaths.map((a) => a.kind).join(", ");

      if (!allowLocalPaths) {
        // ── Production: hard failure ─────────────────────────
        const errorMsg =
          `Artifact storage upload failed for: [${missingKinds}]. ` +
          `storage_path is null — files were not persisted to Supabase Storage. ` +
          `Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in the ` +
          `CAD worker environment and the 'cad-artifacts' bucket exists.`;

        logger.error("Artifact storage integrity check failed", {
          missing_kinds: missingKinds,
          allow_local_artifact_paths: false,
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
            artifacts: [],
            duration_ms: cadResult.duration_ms ?? 0,
          });
        }

        // Retryable: the worker may succeed on the next attempt if the
        // Supabase Storage outage was transient.
        throw new Error(`[storage_upload_failed] ${errorMsg}`);
      }

      // ── Local dev degraded mode ──────────────────────────
      logger.warn(
        "ALLOW_LOCAL_ARTIFACT_PATHS=true — proceeding in degraded/local-only mode. " +
        "Artifacts with null storage_path will be marked local_only=true. " +
        "DO NOT use this flag in production.",
        { missing_kinds: missingKinds }
      );
    }

    // ── Step 6: Write receipt.json to Supabase Storage ───────
    // Determine final run/job status based on whether we are in degraded mode.
    const hasMissingPaths = missingStoragePaths.length > 0;
    const isDegradedLocalMode = hasMissingPaths && allowLocalPaths;

    const runStatus = isDegradedLocalMode ? "degraded_local" : "success";
    const jobStatus = isDegradedLocalMode ? "awaiting_approval_local" : "awaiting_approval";

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
      degraded_local: isDegradedLocalMode,
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
    // Build the artifact rows. In degraded mode, null-path artifacts get
    // local_only=true so the UI can gate download buttons accordingly.
    const artifactRows = cadArtifacts
      .filter((a) => a.storage_path !== null || isDegradedLocalMode)
      .map((a) => ({
        cad_run_id,
        job_id,
        kind: a.kind,
        storage_path: a.storage_path,           // null in degraded mode
        mime_type: a.mime_type,
        file_size_bytes: a.file_size_bytes,
        local_only: a.storage_path === null,    // UI gate flag
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
        local_only: false,
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
        status: runStatus,
        normalized_params_json: cadResult.normalized_params ?? {},
        validation_report_json: cadResult.validation ?? {},
        ended_at: new Date().toISOString(),
      })
      .eq("id", cad_run_id);

    // ── Step 9: Update job status ─────────────────────────────
    await supabase
      .from("jobs")
      .update({
        status: jobStatus,
        latest_run_id: cad_run_id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job_id);

    logger.info("CAD generation pipeline completed", {
      job_id, cad_run_id,
      run_status: runStatus,
      job_status: jobStatus,
      artifact_count: artifactRows.length,
      degraded_local: isDegradedLocalMode,
    });

    // ── Step 10: Notify web app webhook ───────────────────────
    if (webhookUrl) {
      await notifyWebhook(webhookUrl, webhookSecret, {
        job_id, cad_run_id, part_spec_id,
        status: runStatus,
        degraded_local: isDegradedLocalMode,
        generator_name: cadResult.generator_name,
        generator_version: cadResult.generator_version,
        normalized_params: cadResult.normalized_params ?? {},
        validation: cadResult.validation ?? null,
        artifacts: artifactRows,
        assumptions: cadResult.assumptions ?? [],
        warnings: cadResult.warnings ?? [],
        duration_ms: cadResult.duration_ms ?? 0,
      });
    }

    return {
      success: !isDegradedLocalMode,
      degraded_local: isDegradedLocalMode,
      job_id,
      cad_run_id,
      run_status: runStatus,
      artifact_count: artifactRows.length,
      duration_ms: cadResult.duration_ms,
    };
  },
});
