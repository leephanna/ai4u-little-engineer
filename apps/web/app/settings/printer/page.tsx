import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PrinterProfileForm } from "@/components/settings/PrinterProfileForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Printer Settings — AI4U Little Engineer" };

export default async function PrinterSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profiles } = await supabase
    .from("printer_profiles")
    .select("*")
    .eq("user_id", user.id)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });

  const defaultProfile = profiles?.find((p) => p.is_default) ?? profiles?.[0] ?? null;

  return (
    <div className="min-h-screen bg-steel-950">
      <header className="border-b border-steel-800 px-4 py-4">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-xl font-bold text-steel-100">Printer Settings</h1>
          <p className="text-steel-400 text-sm mt-1">
            Configure your printer tolerances so generated parts fit perfectly.
          </p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-8">
        {/* Profile list */}
        {profiles && profiles.length > 1 && (
          <section>
            <h2 className="text-sm font-semibold text-steel-400 uppercase tracking-wide mb-3">
              Your Profiles
            </h2>
            <div className="space-y-2">
              {profiles.map((p) => (
                <div
                  key={p.id}
                  className={`card flex items-center justify-between ${
                    p.is_default ? "border-brand-600" : ""
                  }`}
                >
                  <div>
                    <p className="text-steel-200 font-medium">{p.name}</p>
                    <p className="text-steel-500 text-xs">
                      {p.material} · {p.nozzle_diameter_mm}mm nozzle · {p.layer_height_mm}mm layers
                    </p>
                  </div>
                  {p.is_default && (
                    <span className="text-xs bg-brand-900 text-brand-300 px-2 py-0.5 rounded-full">
                      Default
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Edit / Create form */}
        <section>
          <h2 className="text-sm font-semibold text-steel-400 uppercase tracking-wide mb-3">
            {defaultProfile ? "Edit Default Profile" : "Create Printer Profile"}
          </h2>
          <PrinterProfileForm profile={defaultProfile} userId={user.id} />
        </section>
      </main>
    </div>
  );
}
