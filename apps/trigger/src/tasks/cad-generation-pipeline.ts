/**
 * CAD Generation Pipeline — Trigger.dev Task
 *
 * This is the main orchestration task that:
 * 1. Fetches the PartSpec from Supabase
 * 2. Calls the CAD worker FastAPI service
 * 3. Uploads artifacts to Supabase Storage
 * 4. Writes the receipt.json
 * 5. Calls back the web app webhook
 * 6. Handles retries and failure reporting
 *
 * Task ID: cad-generation-pipeline
 */

import { task, logger, retry, AbortTaskRunError } from "@trigger.dev/sdk/v3";
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
  if (!url) {
    throw new Error("Missing CAD_WORKER_URL environment variable");
  }
  return url.replace(/\/$/, "");
}

async function callCadWorker(
  cadWorkerUrl: string,
  payload: Record<string, unknown>,
  timeoutMs: number = 120_000
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
      throw new Error(
        `CAD worker returned ${response.status}: ${errorText.slice(0, 500)}`
      );
    }

    return (await response.json()) as Record<string, unknown>;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function uploadArtifactToStorage(
  supabase: ReturnType<typeof createClient>,
  localPath: string,
  storagePath: string,
  mimeType: string
): Promise<string> {
  // In the Trigger.dev environment, the CAD worker runs in a separate container.
  // The worker uploads files to a shared volume or returns them as base64.
  // For V1, we assume the worker returns artifact content as base64 in the response.
  // This function handles the Supabase Storage upload.

  // TODO: Implement actual file transfer mechanism (shared volume or base64 response)
  // For now, return the storage path as-is (worker handles upload directly)
  return storagePath;
}

async function notifyWebhook(
  webhookUrl: string,
  webhookSecret: string | undefined,
  payload: Record<string, unknown>
): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (webhookSecret) {
    headers["x-webhook-secret"] = webhookSecret;
  }

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
  maxDuration: 300, // 5 minutes max
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
      job_id,
      cad_run_id,
      part_spec_id,
      variant_type,
      engine,
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

    // ── Step 2: Fetch PartSpec from Supabase ─────────────────
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
      const errorMsg = `CAD worker call failed: ${err instanceof Error ? err.message : String(err)}`;
      logger.error(errorMsg);

      await supabase
        .from("cad_runs")
        .update({
          status: "failed",
          error_text: errorMsg,
          ended_at: new Date().toISOString(),
        })
        .eq("id", cad_run_id);

      // Retry on network errors
      throw new Error(errorMsg);
    }

    const cadStatus = cadResult.status as string;
    const cadArtifacts = (cadResult.artifacts as Array<{
      kind: string;
      local_path: string;
      mime_type: string;
      file_size_bytes: number | null;
    }>) ?? [];

    logger.log("CAD worker response received", {
      status: cadStatus,
      artifact_count: cadArtifacts.length,
      duration_ms: cadResult.duration_ms,
    });

    // ── Step 4: Handle generation failure ────────────────────
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

      // Notify webhook of failure
      if (webhookUrl) {
        await notifyWebhook(webhookUrl, webhookSecret, {
          job_id,
          cad_run_id,
          part_spec_id,
          status: "failed",
          generator_name: cadResult.generator_name ?? spec.family,
          generator_version: cadResult.generator_version ?? "1.0.0",
          normalized_params: cadResult.normalized_params ?? {},
          validation: cadResult.validation ?? null,
          artifacts: [],
          error: errorMsg,
          failure_stage: failureStage,
          assumptions: cadResult.assumptions ?? [],
          warnings: cadResult.warnings ?? [],
          duration_ms: cadResult.duration_ms ?? 0,
        });
      }

      // Don't retry on validation/dimension failures (user-fixable)
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

    // ── Step 5: Upload artifacts to Supabase Storage ─────────
    logger.log("Uploading artifacts", { count: cadArtifacts.length });

    const uploadedArtifacts: Array<{
      kind: string;
      storage_path: string;
      mime_type: string;
      file_size_bytes: number | null;
    }> = [];

    for (const artifact of cadArtifacts) {
      // Storage path: cad-artifacts/{job_id}/{cad_run_id}/{filename}
      const filename = artifact.local_path.split("/").pop() ?? `artifact.${artifact.kind}`;
      const storagePath = `${job_id}/${cad_run_id}/${filename}`;

      // The CAD worker should have already uploaded the file to storage
      // In V1, we trust the worker's reported paths
      uploadedArtifacts.push({
        kind: artifact.kind,
        storage_path: storagePath,
        mime_type: artifact.mime_type,
        file_size_bytes: artifact.file_size_bytes,
      });
    }

    // ── Step 6: Write receipt.json ────────────────────────────
    const receipt = {
      schema_version: "1.0",
      generated_at: new Date().toISOString(),
      job_id,
      cad_run_id,
      part_spec_id,
      variant_type,
      engine,
      generator_name: cadResult.generator_name,
      generator_version: cadResult.generator_version,
      normalized_params: cadResult.normalized_params,
      validation: cadResult.validation,
      assumptions: cadResult.assumptions ?? [],
      warnings: cadResult.warnings ?? [],
      artifacts: uploadedArtifacts.map((a) => ({
        kind: a.kind,
        storage_path: a.storage_path,
        mime_type: a.mime_type,
        file_size_bytes: a.file_size_bytes,
      })),
      trigger_run_id: ctx.run.id,
      duration_ms: cadResult.duration_ms,
    };

    // Upload receipt to storage
    const receiptPath = `${job_id}/${cad_run_id}/receipt.json`;
    const { error: receiptError } = await supabase.storage
      .from("cad-artifacts")
      .upload(receiptPath, JSON.stringify(receipt, null, 2), {
        contentType: "application/json",
        upsert: true,
      });

    if (receiptError) {
      logger.warn("Failed to upload receipt.json", { error: receiptError.message });
    } else {
      uploadedArtifacts.push({
        kind: "json_receipt",
        storage_path: receiptPath,
        mime_type: "application/json",
        file_size_bytes: JSON.stringify(receipt).length,
      });
    }

    // ── Step 7: Update cad_run record ─────────────────────────
    await supabase
      .from("cad_runs")
      .update({
        status: "success",
        normalized_params_json: cadResult.normalized_params ?? {},
        validation_report_json: cadResult.validation ?? {},
        ended_at: new Date().toISOString(),
      })
      .eq("id", cad_run_id);

    // ── Step 8: Insert artifact records ───────────────────────
    if (uploadedArtifacts.length > 0) {
      const { error: artifactError } = await supabase.from("artifacts").insert(
        uploadedArtifacts.map((a) => ({
          cad_run_id,
          job_id,
          kind: a.kind,
          storage_path: a.storage_path,
          mime_type: a.mime_type,
          file_size_bytes: a.file_size_bytes,
        }))
      );

      if (artifactError) {
        logger.error("Failed to insert artifact records", {
          error: artifactError.message,
        });
      }
    }

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
      job_id,
      cad_run_id,
      artifact_count: uploadedArtifacts.length,
    });

    // ── Step 10: Notify web app webhook ───────────────────────
    if (webhookUrl) {
      await notifyWebhook(webhookUrl, webhookSecret, {
        job_id,
        cad_run_id,
        part_spec_id,
        status: "success",
        generator_name: cadResult.generator_name,
        generator_version: cadResult.generator_version,
        normalized_params: cadResult.normalized_params ?? {},
        validation: cadResult.validation ?? null,
        artifacts: uploadedArtifacts,
        assumptions: cadResult.assumptions ?? [],
        warnings: cadResult.warnings ?? [],
        duration_ms: cadResult.duration_ms ?? 0,
      });
    }

    return {
      success: true,
      job_id,
      cad_run_id,
      artifact_count: uploadedArtifacts.length,
      duration_ms: cadResult.duration_ms,
    };
  },
});
