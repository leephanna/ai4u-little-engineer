/**
 * Admin Layout — role='admin' guard
 *
 * Redirects to / if the authenticated user does not have role='admin'
 * in the public.profiles table.
 */
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getAuthUser } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();

    const user = await getAuthUser();
  if (!user) {
    redirect("/sign-in");
  }

  // Check role in profiles table
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    redirect("/");
  }

  return <>{children}</>;
}
