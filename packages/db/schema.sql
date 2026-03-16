-- ─────────────────────────────────────────────────────────────────────────────
-- AI4U Little Engineer — Supabase PostgreSQL Schema
-- Version: v4 (Option A — degraded mode removed)
-- ─────────────────────────────────────────────────────────────────────────────
-- CHANGE LOG
--
-- v4 (Option A — degraded mode removed):
--   - Removed 'awaiting_approval_local' from jobs.status CHECK.
--   - Removed 'degraded_local' from cad_runs.status CHECK.
--   - Reverted artifacts.storage_path to TEXT NOT NULL.
--   - Removed artifacts.local_only column and its CHECK constraint.
--   - Removed ALLOW_LOCAL_ARTIFACT_PATHS references from comments.
--   Rationale: v1 has no local-dev fallback. Any missing storage_path
--   fails the run. Configure a real Supabase project for local dev.
--
-- v3 (degraded-mode repair — superseded by v4):
--   - Added 'awaiting_approval_local', 'degraded_local', local_only, etc.
--   - Reverted in v4.
--
-- v2 (auth repair):
--   A. Removed public.users table entirely.
--      All user_id columns now reference auth.users(id) directly.
--      Supabase Auth IS the user store — no manual sync required.
--   B. sessions.user_id, devices.user_id, approvals.reviewer_user_id
--      now reference auth.users(id) directly.
--   C. RLS policies updated to use auth.uid() directly.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────
-- Extensions
-- ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ─────────────────────────────────────────────────────────────
-- profiles
-- Optional display-name store keyed off auth.users.id.
-- NOT a FK parent for any other table — purely informational.
-- Auto-created on first sign-in via the trigger below.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT,
  role        TEXT NOT NULL DEFAULT 'builder'
                CHECK (role IN ('admin', 'builder', 'reviewer')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create a profile row whenever a new auth user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─────────────────────────────────────────────────────────────
-- devices
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.devices (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label       TEXT,
  platform    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- sessions
-- Represents a single voice conversation session.
-- Created server-side before the first voice turn.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sessions (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id           UUID REFERENCES public.devices(id) ON DELETE SET NULL,
  started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at            TIMESTAMPTZ,
  transcript_summary  TEXT
);

-- ─────────────────────────────────────────────────────────────
-- jobs
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.jobs (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id            UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
  title                 TEXT NOT NULL DEFAULT 'Untitled Part',
  status                TEXT NOT NULL DEFAULT 'draft'
                          CHECK (status IN (
                            'draft',
                            'clarifying',
                            'generating',
                            'awaiting_approval',
                            'approved',
                            'rejected',
                            'printed',
                            'failed'
                          )),
  requested_family      TEXT,
  selected_family       TEXT,
  confidence_score      NUMERIC(4,3),
  latest_spec_version   INT NOT NULL DEFAULT 0,
  latest_run_id         UUID,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS jobs_updated_at ON public.jobs;
CREATE TRIGGER jobs_updated_at
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- voice_turns
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.voice_turns (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id       UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  job_id           UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  speaker          TEXT NOT NULL CHECK (speaker IN ('user', 'assistant')),
  transcript_text  TEXT NOT NULL,
  audio_url        TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- part_specs
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.part_specs (
  id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id                      UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  version                     INT NOT NULL DEFAULT 1,
  units                       TEXT NOT NULL DEFAULT 'mm' CHECK (units IN ('in', 'mm')),
  family                      TEXT NOT NULL,
  material                    TEXT,
  dimensions_json             JSONB NOT NULL DEFAULT '{}',
  load_requirements_json      JSONB NOT NULL DEFAULT '{}',
  constraints_json            JSONB NOT NULL DEFAULT '{}',
  printer_constraints_json    JSONB NOT NULL DEFAULT '{}',
  assumptions_json            JSONB NOT NULL DEFAULT '[]',
  missing_fields_json         JSONB NOT NULL DEFAULT '[]',
  source_transcript_span_json JSONB,
  created_by                  TEXT NOT NULL DEFAULT 'ai'
                                CHECK (created_by IN ('ai', 'user', 'hybrid')),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_id, version)
);

-- ─────────────────────────────────────────────────────────────
-- concept_variants
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.concept_variants (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id         UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  part_spec_id   UUID NOT NULL REFERENCES public.part_specs(id) ON DELETE CASCADE,
  variant_type   TEXT NOT NULL
                   CHECK (variant_type IN ('requested', 'stronger', 'print_optimized', 'alternate')),
  description    TEXT,
  rationale      TEXT,
  score_json     JSONB NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- cad_runs
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cad_runs (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id                 UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  part_spec_id           UUID NOT NULL REFERENCES public.part_specs(id) ON DELETE CASCADE,
  concept_variant_id     UUID REFERENCES public.concept_variants(id) ON DELETE SET NULL,
  engine                 TEXT NOT NULL DEFAULT 'build123d'
                           CHECK (engine IN ('build123d', 'freecad')),
  generator_name         TEXT NOT NULL,
  generator_version      TEXT NOT NULL DEFAULT '1.0.0',
  -- v1 statuses: queued | running | success | failed
  -- 'degraded_local' was removed in v4 (Option A).
  status                 TEXT NOT NULL DEFAULT 'queued'
                           CHECK (status IN ('queued', 'running', 'success', 'failed')),
  source_code            TEXT,
  normalized_params_json JSONB NOT NULL DEFAULT '{}',
  validation_report_json JSONB NOT NULL DEFAULT '{}',
  error_text             TEXT,
  started_at             TIMESTAMPTZ,
  ended_at               TIMESTAMPTZ
);

-- ─────────────────────────────────────────────────────────────
-- artifacts
-- All artifacts MUST have a non-null storage_path pointing to
-- a file in the 'cad-artifacts' Supabase Storage bucket.
-- The Trigger.dev pipeline enforces this at the application level
-- (Step 5 integrity gate) before inserting any artifact rows.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.artifacts (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cad_run_id       UUID NOT NULL REFERENCES public.cad_runs(id) ON DELETE CASCADE,
  job_id           UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  kind             TEXT NOT NULL
                     CHECK (kind IN ('step', 'stl', 'png', 'json_receipt', 'transcript', 'prompt', 'log')),
  storage_path     TEXT NOT NULL,
  mime_type        TEXT NOT NULL,
  file_size_bytes  BIGINT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- approvals
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.approvals (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id           UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  cad_run_id       UUID NOT NULL REFERENCES public.cad_runs(id) ON DELETE CASCADE,
  reviewer_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  decision         TEXT NOT NULL CHECK (decision IN ('approved', 'rejected', 'revision_requested')),
  notes            TEXT,
  decided_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- print_results
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.print_results (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id            UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  cad_run_id        UUID NOT NULL REFERENCES public.cad_runs(id) ON DELETE CASCADE,
  printer_name      TEXT,
  slicer_name       TEXT,
  material          TEXT,
  layer_height      NUMERIC(5,3),
  nozzle_size       NUMERIC(4,2),
  infill_percent    NUMERIC(5,2),
  orientation_notes TEXT,
  outcome           TEXT NOT NULL CHECK (outcome IN ('success', 'partial', 'fail')),
  fit_score         SMALLINT CHECK (fit_score BETWEEN 1 AND 5),
  strength_score    SMALLINT CHECK (strength_score BETWEEN 1 AND 5),
  surface_score     SMALLINT CHECK (surface_score BETWEEN 1 AND 5),
  issue_tags        TEXT[] NOT NULL DEFAULT '{}',
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_jobs_user_id         ON public.jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status          ON public.jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_session_id      ON public.jobs(session_id);
CREATE INDEX IF NOT EXISTS idx_voice_turns_session  ON public.voice_turns(session_id);
CREATE INDEX IF NOT EXISTS idx_voice_turns_job      ON public.voice_turns(job_id);
CREATE INDEX IF NOT EXISTS idx_part_specs_job       ON public.part_specs(job_id);
CREATE INDEX IF NOT EXISTS idx_cad_runs_job         ON public.cad_runs(job_id);
CREATE INDEX IF NOT EXISTS idx_cad_runs_status      ON public.cad_runs(status);
CREATE INDEX IF NOT EXISTS idx_artifacts_job        ON public.artifacts(job_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_run        ON public.artifacts(cad_run_id);
CREATE INDEX IF NOT EXISTS idx_approvals_job        ON public.approvals(job_id);
CREATE INDEX IF NOT EXISTS idx_print_results_job    ON public.print_results(job_id);

-- ─────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_turns      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.part_specs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concept_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cad_runs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artifacts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approvals        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_results    ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- devices
CREATE POLICY "Users can manage own devices"
  ON public.devices FOR ALL
  USING (auth.uid() = user_id);

-- sessions
CREATE POLICY "Users can manage own sessions"
  ON public.sessions FOR ALL
  USING (auth.uid() = user_id);

-- jobs
CREATE POLICY "Users can view own jobs"
  ON public.jobs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own jobs"
  ON public.jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own jobs"
  ON public.jobs FOR UPDATE
  USING (auth.uid() = user_id);

-- voice_turns (via session ownership)
CREATE POLICY "Users can view own voice turns"
  ON public.voice_turns FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_id AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own voice turns"
  ON public.voice_turns FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_id AND s.user_id = auth.uid()
    )
  );

-- part_specs (via job ownership)
CREATE POLICY "Users can view own part specs"
  ON public.part_specs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_id AND j.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own part specs"
  ON public.part_specs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_id AND j.user_id = auth.uid()
    )
  );

-- concept_variants (via job ownership)
CREATE POLICY "Users can view own concept variants"
  ON public.concept_variants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_id AND j.user_id = auth.uid()
    )
  );

-- cad_runs (via job ownership)
CREATE POLICY "Users can view own cad runs"
  ON public.cad_runs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_id AND j.user_id = auth.uid()
    )
  );

-- artifacts (via job ownership)
CREATE POLICY "Users can view own artifacts"
  ON public.artifacts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_id AND j.user_id = auth.uid()
    )
  );

-- approvals (via job ownership)
CREATE POLICY "Users can view own approvals"
  ON public.approvals FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_id AND j.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own approvals"
  ON public.approvals FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_id AND j.user_id = auth.uid()
    )
  );

-- print_results (via job ownership)
CREATE POLICY "Users can manage own print results"
  ON public.print_results FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_id AND j.user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────
-- Storage bucket policy (apply in Supabase dashboard)
-- ─────────────────────────────────────────────────────────────
-- Bucket name: cad-artifacts
-- Access: private (no public access)
-- RLS: users can read their own artifacts via signed URLs
-- The Trigger.dev pipeline uses the service role key to upload.
-- The web app generates short-lived signed URLs (60s) for downloads.

-- ─────────────────────────────────────────────────────────────
-- © AI4U, LLC. AI4Utech.com, Lee Hanna-Owner.
-- ─────────────────────────────────────────────────────────────
