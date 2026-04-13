/**
 * Admin Layout — role='admin' guard
 *
 * Redirects to /sign-in if not authenticated.
 * Redirects to / if the authenticated user does not have role='admin'
 * in the public.profiles table (looked up by clerk_user_id).
 */
import { createServiceClient } from "@/lib/supabase/service";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getAuthUser } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getAuthUser();
  if (!user) {
    redirect("/sign-in");
  }

  // Check role in profiles table using service client (bypasses RLS)
  const supabase = createServiceClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("clerk_user_id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    redirect("/");
  }

  return <>{children}</>;
}
