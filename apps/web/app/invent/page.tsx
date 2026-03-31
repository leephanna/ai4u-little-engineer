/**
 * /invent
 *
 * Auto-Invention Engine UI.
 * User types a plain-English problem → LLM designs a printable solution →
 * CAD pipeline generates the STL → result page shows the design with
 * save / publish / sell actions.
 */

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import InventionForm from "./InventionForm";

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
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Invent a Design</h1>
          <p className="mt-2 text-gray-600">
            Describe a mechanical problem in plain English. The AI will design a
            3D-printable solution, generate the CAD files, and let you save,
            publish, or sell it.
          </p>
        </div>

        <InventionForm />

        {/* Example prompts */}
        <div className="mt-8">
          <p className="text-sm font-medium text-gray-700 mb-3">Example problems:</p>
          <div className="grid grid-cols-1 gap-2">
            {[
              "I need a spacer to hold two aluminum plates 20mm apart with a 6mm bolt through the center",
              "My cable bundle keeps falling off the desk edge — I need a clip to hold 4 cables together",
              "I need a bracket to mount a 40mm fan to a flat surface at 90 degrees",
              "I need a jig to hold a 50x30mm PCB while I solder it",
              "I need an enclosure for a Raspberry Pi Zero — 65mm x 30mm x 15mm inside",
            ].map((example) => (
              <button
                key={example}
                data-example={example}
                className="text-left px-4 py-2.5 rounded-lg bg-white border border-gray-200 text-sm text-gray-700 hover:border-indigo-400 hover:bg-indigo-50 transition-colors example-prompt"
              >
                &ldquo;{example}&rdquo;
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
