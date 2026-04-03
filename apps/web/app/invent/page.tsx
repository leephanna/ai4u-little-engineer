/**
 * /invent
 *
 * Universal Creation Engine UI.
 * User types, speaks, uploads, or sketches an idea → AI interprets it →
 * CAD pipeline generates the STL → result page shows the design with
 * save / publish / sell actions.
 *
 * Gap 4 fix: replaced InventionForm with UniversalCreatorFlow so the
 * /invent route renders the full multimodal intake experience.
 */

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import UniversalCreatorFlow from "@/components/intake/UniversalCreatorFlow";

export const metadata = {
  title: "Invent a Design | Little Engineer",
  description: "Describe a problem and let AI design a 3D-printable solution.",
};

export default async function InventPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?redirect=/invent");
  }

  return (
    <div className="min-h-screen bg-steel-950">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-steel-100">Invent a Design</h1>
          <p className="mt-2 text-steel-400">
            Describe a mechanical problem in plain English — or upload a photo, sketch, or
            document. AI4U will design a 3D-printable solution, generate the CAD files, and
            let you save, publish, or sell it.
          </p>
        </div>
        <UniversalCreatorFlow />
      </div>
    </div>
  );
}
