"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface PrinterProfile {
  id?: string;
  name: string;
  is_default: boolean;
  layer_height_mm: number;
  nozzle_diameter_mm: number;
  wall_thickness_mm: number;
  infill_percent: number;
  xy_compensation_mm: number;
  z_compensation_mm: number;
  material: string;
  bed_temp_c: number;
  hotend_temp_c: number;
  printer_model: string | null;
  build_x_mm: number | null;
  build_y_mm: number | null;
  build_z_mm: number | null;
}

const MATERIALS = ["PLA", "PETG", "ABS", "ASA", "TPU", "Nylon", "Resin", "Other"];

const MATERIAL_DEFAULTS: Record<string, { bed: number; hotend: number }> = {
  PLA:   { bed: 60,  hotend: 215 },
  PETG:  { bed: 70,  hotend: 240 },
  ABS:   { bed: 100, hotend: 245 },
  ASA:   { bed: 100, hotend: 250 },
  TPU:   { bed: 40,  hotend: 230 },
  Nylon: { bed: 70,  hotend: 260 },
  Resin: { bed: 0,   hotend: 0   },
  Other: { bed: 60,  hotend: 215 },
};

interface Props {
  profile: PrinterProfile | null;
  userId: string;
}

export function PrinterProfileForm({ profile, userId }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const defaults: PrinterProfile = {
    name: "My Printer",
    is_default: true,
    layer_height_mm: 0.2,
    nozzle_diameter_mm: 0.4,
    wall_thickness_mm: 1.2,
    infill_percent: 20,
    xy_compensation_mm: 0.0,
    z_compensation_mm: 0.0,
    material: "PLA",
    bed_temp_c: 60,
    hotend_temp_c: 215,
    printer_model: "",
    build_x_mm: null,
    build_y_mm: null,
    build_z_mm: null,
  };

  const [form, setForm] = useState<PrinterProfile>(profile ?? defaults);

  function update<K extends keyof PrinterProfile>(key: K, value: PrinterProfile[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleMaterialChange(mat: string) {
    const temps = MATERIAL_DEFAULTS[mat] ?? MATERIAL_DEFAULTS.PLA;
    setForm((prev) => ({
      ...prev,
      material: mat,
      bed_temp_c: temps.bed,
      hotend_temp_c: temps.hotend,
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/printer-profile", {
        method: profile?.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, user_id: userId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Save failed");
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      router.refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-6">
      {/* Profile name */}
      <div>
        <label className="label">Profile Name</label>
        <input
          className="input"
          value={form.name}
          onChange={(e) => update("name", e.target.value)}
          placeholder="e.g. Bambu Lab P1S"
          required
        />
      </div>

      {/* Printer model */}
      <div>
        <label className="label">Printer Model (optional)</label>
        <input
          className="input"
          value={form.printer_model ?? ""}
          onChange={(e) => update("printer_model", e.target.value || null)}
          placeholder="e.g. Bambu Lab P1S, Prusa MK4, Ender 3 V3"
        />
      </div>

      {/* Material */}
      <div>
        <label className="label">Material</label>
        <select
          className="input"
          value={form.material}
          onChange={(e) => handleMaterialChange(e.target.value)}
        >
          {MATERIALS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      {/* Temperatures */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Hotend Temp (°C)</label>
          <input
            type="number"
            className="input"
            value={form.hotend_temp_c}
            onChange={(e) => update("hotend_temp_c", Number(e.target.value))}
            min={0}
            max={350}
          />
        </div>
        <div>
          <label className="label">Bed Temp (°C)</label>
          <input
            type="number"
            className="input"
            value={form.bed_temp_c}
            onChange={(e) => update("bed_temp_c", Number(e.target.value))}
            min={0}
            max={150}
          />
        </div>
      </div>

      {/* Nozzle & layer */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Nozzle Diameter (mm)</label>
          <input
            type="number"
            className="input"
            value={form.nozzle_diameter_mm}
            onChange={(e) => update("nozzle_diameter_mm", Number(e.target.value))}
            step="0.1"
            min="0.1"
            max="2.0"
          />
        </div>
        <div>
          <label className="label">Layer Height (mm)</label>
          <input
            type="number"
            className="input"
            value={form.layer_height_mm}
            onChange={(e) => update("layer_height_mm", Number(e.target.value))}
            step="0.05"
            min="0.05"
            max="0.8"
          />
        </div>
      </div>

      {/* Wall & infill */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Wall Thickness (mm)</label>
          <input
            type="number"
            className="input"
            value={form.wall_thickness_mm}
            onChange={(e) => update("wall_thickness_mm", Number(e.target.value))}
            step="0.4"
            min="0.4"
            max="5.0"
          />
        </div>
        <div>
          <label className="label">Infill (%)</label>
          <input
            type="number"
            className="input"
            value={form.infill_percent}
            onChange={(e) => update("infill_percent", Number(e.target.value))}
            min="5"
            max="100"
          />
        </div>
      </div>

      {/* Dimensional compensation */}
      <div>
        <h3 className="text-sm font-semibold text-steel-300 mb-3">
          Dimensional Compensation
          <span className="text-steel-500 font-normal ml-2 text-xs">
            (for holes that come out too tight/loose)
          </span>
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">XY Compensation (mm)</label>
            <input
              type="number"
              className="input"
              value={form.xy_compensation_mm}
              onChange={(e) => update("xy_compensation_mm", Number(e.target.value))}
              step="0.05"
              min="-2"
              max="2"
            />
            <p className="text-steel-500 text-xs mt-1">
              Positive = expand holes, negative = shrink
            </p>
          </div>
          <div>
            <label className="label">Z Compensation (mm)</label>
            <input
              type="number"
              className="input"
              value={form.z_compensation_mm}
              onChange={(e) => update("z_compensation_mm", Number(e.target.value))}
              step="0.05"
              min="-2"
              max="2"
            />
          </div>
        </div>
      </div>

      {/* Build volume */}
      <div>
        <h3 className="text-sm font-semibold text-steel-300 mb-3">Build Volume (mm, optional)</h3>
        <div className="grid grid-cols-3 gap-4">
          {(["build_x_mm", "build_y_mm", "build_z_mm"] as const).map((axis, i) => (
            <div key={axis}>
              <label className="label">{["X", "Y", "Z"][i]}</label>
              <input
                type="number"
                className="input"
                value={form[axis] ?? ""}
                onChange={(e) => update(axis, e.target.value ? Number(e.target.value) : null)}
                min="0"
                max="2000"
                placeholder="—"
              />
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded-lg px-3 py-2 text-red-300 text-sm">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={saving}
        className="btn-primary w-full"
      >
        {saving ? "Saving…" : saved ? "✅ Saved!" : "Save Printer Profile"}
      </button>
    </form>
  );
}
