/**
 * Daedalus Gate Protocol — Receipt Store
 *
 * Persists Daedalus receipts to the `daedalus_receipts` table.
 * Uses the service client so receipts are always written regardless of
 * the user's RLS policies.
 *
 * Usage:
 *   import { storeDaedalusReceipt } from "@/lib/daedalus/store";
 *   const receiptId = await storeDaedalusReceipt(receipt);
 */
import { createServiceClient } from "@/lib/supabase/service";
import type { DaedalusReceipt } from "./types";

/**
 * Store a Daedalus receipt in the database.
 * Returns the assigned receipt_id, or null if storage fails (non-fatal).
 */
export async function storeDaedalusReceipt(
  receipt: DaedalusReceipt
): Promise<string | null> {
  try {
    const serviceSupabase = createServiceClient();
    const { data, error } = await serviceSupabase
      .from("daedalus_receipts")
      .insert({
        gate: receipt.gate,
        session_id: receipt.session_id ?? null,
        job_id: receipt.job_id ?? null,
        user_id: receipt.user_id ?? null,
        timestamp: receipt.timestamp,
        elapsed_ms: receipt.elapsed_ms,
        result: receipt.result,
        confidence: receipt.confidence ?? null,
        payload: receipt.payload,
        notes: receipt.notes,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Daedalus receipt storage failed:", error.message);
      return null;
    }
    return data?.id ?? null;
  } catch (err) {
    // Non-fatal — never block generation for receipt storage failure
    console.error("Daedalus receipt storage exception:", err);
    return null;
  }
}

/**
 * Retrieve all receipts for a session or job (for operator view).
 */
export async function getDaedalusReceiptsForSession(
  sessionId: string
): Promise<DaedalusReceipt[]> {
  try {
    const serviceSupabase = createServiceClient();
    const { data, error } = await serviceSupabase
      .from("daedalus_receipts")
      .select("*")
      .eq("session_id", sessionId)
      .order("timestamp", { ascending: true });

    if (error || !data) return [];
    return data as unknown as DaedalusReceipt[];
  } catch {
    return [];
  }
}

export async function getDaedalusReceiptsForJob(
  jobId: string
): Promise<DaedalusReceipt[]> {
  try {
    const serviceSupabase = createServiceClient();
    const { data, error } = await serviceSupabase
      .from("daedalus_receipts")
      .select("*")
      .eq("job_id", jobId)
      .order("timestamp", { ascending: true });

    if (error || !data) return [];
    return data as unknown as DaedalusReceipt[];
  } catch {
    return [];
  }
}
