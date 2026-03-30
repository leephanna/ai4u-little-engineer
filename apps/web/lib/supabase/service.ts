/**
 * service.ts — synchronous service-role Supabase client
 *
 * Provides a synchronous `createServiceClient()` for use in Next.js Server
 * Components and API routes that need RLS bypass. This is distinct from the
 * async version in server.ts (which is cookie-aware).
 *
 * Uses plain @supabase/supabase-js so that no cookie-based auth is layered
 * on top of the service role key.
 */
import { createClient } from "@supabase/supabase-js";

export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
