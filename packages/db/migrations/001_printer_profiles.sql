-- ─────────────────────────────────────────────────────────────
-- Migration 001: Printer Profiles
-- Stores per-user printer configuration including tolerances,
-- nozzle size, and material presets.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.printer_profiles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                TEXT NOT NULL DEFAULT 'My Printer',
  is_default          BOOLEAN NOT NULL DEFAULT false,

  -- Physical tolerances (mm)
  layer_height_mm     NUMERIC(5,3) NOT NULL DEFAULT 0.2,
  nozzle_diameter_mm  NUMERIC(5,3) NOT NULL DEFAULT 0.4,
  wall_thickness_mm   NUMERIC(5,3) NOT NULL DEFAULT 1.2,
  infill_percent      INTEGER NOT NULL DEFAULT 20 CHECK (infill_percent BETWEEN 5 AND 100),

  -- Dimensional compensation
  xy_compensation_mm  NUMERIC(6,4) NOT NULL DEFAULT 0.0,
  z_compensation_mm   NUMERIC(6,4) NOT NULL DEFAULT 0.0,

  -- Material
  material            TEXT NOT NULL DEFAULT 'PLA'
                        CHECK (material IN ('PLA','PETG','ABS','ASA','TPU','Nylon','Resin','Other')),
  bed_temp_c          INTEGER NOT NULL DEFAULT 60,
  hotend_temp_c       INTEGER NOT NULL DEFAULT 215,

  -- Printer model (free text)
  printer_model       TEXT,

  -- Build volume (mm)
  build_x_mm          NUMERIC(7,2),
  build_y_mm          NUMERIC(7,2),
  build_z_mm          NUMERIC(7,2),

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure only one default per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_printer_profiles_default
  ON public.printer_profiles(user_id)
  WHERE is_default = true;

-- Fast lookups by user
CREATE INDEX IF NOT EXISTS idx_printer_profiles_user
  ON public.printer_profiles(user_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS printer_profiles_updated_at ON public.printer_profiles;
CREATE TRIGGER printer_profiles_updated_at
  BEFORE UPDATE ON public.printer_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.printer_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own printer profiles"
  ON public.printer_profiles FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- Add printer_profile_id FK to jobs so each job knows which
-- printer profile was active when it was created.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS printer_profile_id UUID
    REFERENCES public.printer_profiles(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────
-- Seed a default profile for existing users (runs once)
-- ─────────────────────────────────────────────────────────────
INSERT INTO public.printer_profiles (user_id, name, is_default)
SELECT id, 'Default Printer', true
FROM auth.users
WHERE id NOT IN (SELECT user_id FROM public.printer_profiles)
ON CONFLICT DO NOTHING;
