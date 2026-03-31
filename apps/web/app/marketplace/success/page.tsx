/**
 * /marketplace/success
 *
 * Shown after a successful design purchase.
 * Confirms the purchase and provides download links.
 */

import { Suspense } from "react";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

interface Props {
  searchParams: Promise<{ session_id?: string; project_id?: string }>;
}

async function SuccessContent({ sessionId, projectId }: { sessionId?: string; projectId?: string }) {
  if (!projectId) {
    return (
      <div className="text-center">
        <p className="text-gray-600">Purchase confirmed. Check your library for your new design.</p>
        <Link href="/projects" className="mt-4 inline-block text-indigo-600 hover:underline">
          Go to My Library →
        </Link>
      </div>
    );
  }

  const serviceSupabase = createServiceClient();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: project } = await serviceSupabase
    .from("projects")
    .select("id, title, description, family, stl_url, step_url, success_score")
    .eq("id", projectId)
    .single();

  // Verify purchase
  let purchaseConfirmed = false;
  if (user && projectId) {
    const { data: purchase } = await serviceSupabase
      .from("design_purchases")
      .select("status")
      .eq("project_id", projectId)
      .eq("buyer_id", user.id)
      .single();
    purchaseConfirmed = purchase?.status === "completed";
  }

  return (
    <div className="text-center max-w-lg mx-auto">
      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Purchase Confirmed!</h2>
      {project && (
        <p className="text-gray-600 mb-6">
          You now own <span className="font-semibold">{project.title}</span>.
          {purchaseConfirmed
            ? " Your download links are ready below."
            : " Your purchase is being processed — check back in a moment."}
        </p>
      )}

      {project && purchaseConfirmed && (
        <div className="flex gap-3 justify-center mb-6">
          {project.stl_url && (
            <a
              href={project.stl_url}
              download
              className="inline-flex items-center px-5 py-2.5 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700"
            >
              Download STL
            </a>
          )}
          {project.step_url && (
            <a
              href={project.step_url}
              download
              className="inline-flex items-center px-5 py-2.5 rounded-lg text-sm font-medium bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Download STEP
            </a>
          )}
        </div>
      )}

      <div className="flex gap-3 justify-center">
        <Link
          href="/marketplace"
          className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
        >
          Back to Marketplace
        </Link>
        <Link
          href="/projects"
          className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700"
        >
          My Library
        </Link>
      </div>
    </div>
  );
}

export default async function MarketplaceSuccessPage({ searchParams }: Props) {
  const params = await searchParams;
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 w-full max-w-lg">
        <Suspense fallback={<p className="text-center text-gray-500">Loading...</p>}>
          <SuccessContent sessionId={params.session_id} projectId={params.project_id} />
        </Suspense>
      </div>
    </div>
  );
}
