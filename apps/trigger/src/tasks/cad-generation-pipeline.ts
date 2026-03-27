/**
 * CAD Generation Pipeline — Trigger.dev Task (v1 production)
 *
 * Artifact storage integrity contract
 * ─────────────────────────────────────
 * Every STEP and STL artifact returned by the CAD worker MUST have a non-null
 * storage_path before this pipeline will mark the run successful and transition
 * the job to awaiting_approval.
 *
 * Primary path: CAD worker uploads files itself and returns storage_path.
 * Fallback path: If storage_path is null, this pipeline fetches the file from
 * the worker's /artifacts endpoint and uploads it to Supabase Storage directly.
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
 * 3. POST /generate to CAD worker (with normalized dimension keys)
 * 4. Worker uploads files → returns storage_path per artifact
 * 5. For any artifact with null storage_path: fetch from /artifacts and upload
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

    // Normalize dimension keys: strip trailing "_mm" suffix so that keys like
    // "outer_diameter_mm" become "outer_diameter". The CAD worker generators
    // expect plain keys ("outer_diameter", "height", etc.) without the unit
    // suffix. Both old records (with _mm) and new records (without) are handled.
    const rawDims: Record<string, number> = spec.dimensions_json ?? {};
    const normalizedDims: Record<string, number> = {};
    for (const [k, v] of Object.entries(rawDims)) {
      const normalKey = k.endsWith("_mm") ? k.slice(0, -3) : k;
      normalizedDims[normalKey] = v as number;
    }
    logger.log("Normalized dimensions", {
      raw_keys: Object.keys(rawDims),
      normalized_keys: Object.keys(normalizedDims),
    });

    let cadResult: Record<string, unknown>;
    try {
      cadResult = await callCadWorker(cadWorkerUrl, {
        job_id,
        part_spec_id,
        part_spec: {
          family: spec.family,
          units: spec.units,
          material: spec.material ?? "Unknown",
          dimensions: normalizedDims,
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

    // ── Step 5: Artifact storage integrity gate + fallback upload ─
    //
    // Every STEP and STL artifact must have a real, non-null storage_path.
    // Primary: CAD worker uploads and returns storage_path.
    // Fallback: If null, this pipeline fetches from /artifacts and uploads.

    const missingStoragePaths = cadArtifacts.filter(
      (a) => REQUIRED_STORAGE_KINDS.has(a.kind) && a.storage_path === null
    );

    if (missingStoragePaths.length > 0) {
      logger.warn(
        `CAD worker did not upload ${missingStoragePaths.length} artifact(s) — ` +
        `attempting fallback upload from /artifacts endpoint`,
        { missing_kinds: missingStoragePaths.map((a) => a.kind) }
      );

      for (const artifact of missingStoragePaths) {
        // local_path is container-internal: /app/artifacts/{job_id}/{worker_run_id}/{filename}
        const localPath = artifact.local_path as string;
        const pathParts = localPath.split("/");
        const filename = pathParts[pathParts.length - 1] ?? `${artifact.kind}.bin`;
        // Extract worker-generated IDs from the path
        const workerRunId = pathParts.length >= 2 ? pathParts[pathParts.length - 2] : cad_run_id;
        const workerJobId = pathParts.length >= 3 ? pathParts[pathParts.length - 3] : job_id;

        const artifactUrl = `${cadWorkerUrl}/artifacts/${workerJobId}/${workerRunId}/${filename}`;
        logger.log(`Fetching artifact from worker: ${artifactUrl}`);

        let fileBytes: ArrayBuffer;
        try {
          const fetchResp = await fetch(artifactUrl, { signal: AbortSignal.timeout(30_000) });
          if (!fetchResp.ok) {
            throw new Error(`Worker returned ${fetchResp.status} for ${artifactUrl}`);
          }
          fileBytes = await fetchResp.arrayBuffer();
          logger.log(`Fetched ${fileBytes.byteLength} bytes for ${artifact.kind}`);
        } catch (fetchErr) {
          logger.error(`Fallback artifact fetch failed for ${artifact.kind}`, {
            error: fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
            url: artifactUrl,
          });
          continue; // Will be caught by stillMissing check below
        }

        // Upload to Supabase Storage using our own service role key
        const storagePath = `${job_id}/${cad_run_id}/${filename}`;
        const { error: uploadError } = await supabase.storage
          .from("cad-artifacts")
          .upload(storagePath, fileBytes, {
            contentType: artifact.mime_type,
            upsert: true,
          });

        if (uploadError) {
          logger.error(`Fallback upload to Supabase failed for ${artifact.kind}`, {
            error: uploadError.message,
            storage_path: storagePath,
          });
          continue; // Will be caught by stillMissing check below
        }

        // Patch the artifact in-place with the real storage_path
        artifact.storage_path = storagePath;
        logger.log(`Fallback upload succeeded for ${artifact.kind}`, { storagePath });
      }
    }

    // Re-check after fallback attempts
    const stillMissing = cadArtifacts.filter(
      (a) => REQUIRED_STORAGE_KINDS.has(a.kind) && a.storage_path === null
    );

    if (stillMissing.length > 0) {
      const missingKinds = stillMissing.map((a) => a.kind).join(", ");
      const errorMsg =
        `Artifact storage upload failed for: [${missingKinds}]. ` +
        `storage_path is null after both worker upload and fallback fetch. ` +
        `Check CAD worker /artifacts endpoint and Supabase Storage config.`;

      logger.error("Artifact storage integrity check failed after fallback", {
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

      // Retryable: the worker may succeed on the next attempt.
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
