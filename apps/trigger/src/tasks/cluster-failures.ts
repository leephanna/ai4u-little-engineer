/**
 * cluster-failures — Trigger.dev Task
 *
 * Analyzes recent failed CAD runs and design_learning_records to identify
 * failure patterns. Groups failures by family, error type, and dimension
 * patterns. Writes cluster summaries to decision_ledger.
 *
 * Triggered by: scheduled (daily) or manually.
 * Payload: { lookback_hours?: number } (default: 24)
 */

import { task, logger } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { z } from "zod";

const ClusterPayload = z.object({
  lookback_hours: z.number().default(24),
});

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key);
}

export const clusterFailures = task({
  id: "cluster-failures",
  maxDuration: 120,
  run: async (payload: unknown) => {
    const { lookback_hours } = ClusterPayload.parse(payload ?? {});
    const supabase = getSupabaseClient();
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const since = new Date(Date.now() - lookback_hours * 3600 * 1000).toISOString();

    logger.log("Clustering failures", { lookback_hours, since });

    // ── Load recent failed cad_runs ───────────────────────────
    const { data: failedRuns } = await supabase
      .from("cad_runs")
      .select("id, job_id, error_text, validation_report_json, started_at")
      .eq("status", "failed")
      .gte("started_at", since)
      .order("started_at", { ascending: false })
      .limit(50);

    if (!failedRuns || failedRuns.length === 0) {
      logger.log("No failed runs in lookback window");
      return { clusters: [], failure_count: 0 };
    }

    logger.log(`Found ${failedRuns.length} failed runs`);

    // ── Load associated part_specs for context ────────────────
    const jobIds = [...new Set(failedRuns.map((r) => r.job_id))];
    const { data: specs } = await supabase
      .from("part_specs")
      .select("job_id, family, dimensions_json, units")
      .in("job_id", jobIds);

    const specByJobId = Object.fromEntries(
      (specs ?? []).map((s) => [s.job_id, s])
    );

    // ── Build failure summary for LLM clustering ──────────────
    const failureSummaries = failedRuns.map((run) => {
      const spec = specByJobId[run.job_id];
      return {
        run_id: run.id,
        job_id: run.job_id,
        family: spec?.family ?? "unknown",
        error_text: run.error_text ?? "unknown error",
        dimensions: spec?.dimensions_json ?? {},
        validation: run.validation_report_json ?? {},
      };
    });

    // ── Use LLM to cluster failures ───────────────────────────
    let clusters: Record<string, unknown>[] = [];
    try {
      const clusterPrompt = `You are analyzing CAD generation failures for an AI-powered CAD app.
Analyze these ${failedRuns.length} failure records and identify distinct failure clusters.
For each cluster, provide:
- cluster_id: short snake_case identifier
- label: human-readable label
- count: number of failures in this cluster
- root_cause: concise root cause description
- affected_families: list of part families affected
- recommended_action: what should be fixed (prompt, code, validation, etc.)

Failure records:
${JSON.stringify(failureSummaries.slice(0, 20), null, 2)}

Respond with JSON: { "clusters": [...] }`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [{ role: "user", content: clusterPrompt }],
        temperature: 0.2,
        max_tokens: 1024,
        response_format: { type: "json_object" },
      });

      const raw = completion.choices[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(raw);
      clusters = parsed.clusters ?? [];
    } catch (err) {
      logger.warn("LLM clustering failed, using rule-based fallback", { error: String(err) });

      // Rule-based fallback: group by family
      const byFamily: Record<string, number> = {};
      for (const f of failureSummaries) {
        byFamily[f.family] = (byFamily[f.family] ?? 0) + 1;
      }
      clusters = Object.entries(byFamily).map(([family, count]) => ({
        cluster_id: `family_${family}`,
        label: `Failures in ${family}`,
        count,
        root_cause: "Unknown — LLM clustering unavailable",
        affected_families: [family],
        recommended_action: "Manual review required",
      }));
    }

    logger.log("Clusters identified", { cluster_count: clusters.length });

    // ── Write cluster summary to decision_ledger ──────────────
    await supabase.from("decision_ledger").insert({
      job_id: null,
      step: "cluster_failures",
      decision_reason: `Clustered ${failedRuns.length} failures into ${clusters.length} clusters over last ${lookback_hours}h`,
      inputs: { lookback_hours, failure_count: failedRuns.length, since },
      outputs: { clusters, failure_count: failedRuns.length },
    });

    return {
      failure_count: failedRuns.length,
      cluster_count: clusters.length,
      clusters,
      lookback_hours,
    };
  },
});
