-- AI4U Little Engineer — Supabase / Postgres Schema
-- Run this against a fresh Supabase project.
-- Requires: pgvector extension (enable in Supabase dashboard or via SQL below)

-- ─────────────────────────────────────────────────────────────
-- Extensions
-- ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ─────────────────────────────────────────────────────────────
-- ENUM-like check constraints (kept as text for flexibility)
-- ─────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────
-- users
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.users (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email       TEXT NOT NULL UNIQUE,
  full_name   TEXT,
  role        TEXT NOT NULL DEFAULT 'builder'
                CHECK (role IN ('admin', 'builder', 'reviewer')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- devices
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.devices (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  label       TEXT,
  platform    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- sessions
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sessions (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
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
  user_id               UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  session_id            UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
  title                 TEXT NOT NULL DEFAULT 'Untitled Part',
  status                TEXT NOT NULL DEFAULT 'draft'
                          CHECK (status IN (
                            'draft', 'clarifying', 'generating',
                            'awaiting_approval', 'approved', 'rejected',
                            'printed', 'failed'
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
  reviewer_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
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
  fit_score         NUMERIC(3,2),
  strength_score    NUMERIC(3,2),
  surface_score     NUMERIC(3,2),
  issue_tags        TEXT[] NOT NULL DEFAULT '{}',
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- learning_events
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.learning_events (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id              UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  source_type         TEXT NOT NULL
                        CHECK (source_type IN ('approval', 'print_result', 'manual_edit', 'eval_fail')),
  event_payload_json  JSONB NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- embeddings_memory (pgvector)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.embeddings_memory (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id        UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  memory_type   TEXT NOT NULL
                  CHECK (memory_type IN ('transcript', 'spec', 'print_result', 'design_pattern')),
  content       TEXT NOT NULL,
  embedding     vector(1536),
  metadata_json JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- eval_runs
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.eval_runs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  suite_name  TEXT NOT NULL,
  git_sha     TEXT,
  provider    TEXT,
  result_json JSONB NOT NULL DEFAULT '{}',
  score       NUMERIC(5,4),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_jobs_user_created
  ON public.jobs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_part_specs_job_version
  ON public.part_specs (job_id, version DESC);

CREATE INDEX IF NOT EXISTS idx_cad_runs_job_started
  ON public.cad_runs (job_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_print_results_job_created
  ON public.print_results (job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_voice_turns_session
  ON public.voice_turns (session_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_artifacts_job
  ON public.artifacts (job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_embeddings_job
  ON public.embeddings_memory (job_id);

-- Vector similarity index (HNSW for fast approximate nearest neighbor)
CREATE INDEX IF NOT EXISTS idx_embeddings_vector
  ON public.embeddings_memory USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ─────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.part_specs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concept_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cad_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.embeddings_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eval_runs ENABLE ROW LEVEL SECURITY;

-- Users: read/write own row
CREATE POLICY "users_own" ON public.users
  FOR ALL USING (auth.uid() = id);

-- Admins can read all users
CREATE POLICY "users_admin_read" ON public.users
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

-- Jobs: users own their jobs
CREATE POLICY "jobs_own" ON public.jobs
  FOR ALL USING (auth.uid() = user_id);

-- Jobs: admins and reviewers can read all
CREATE POLICY "jobs_admin_reviewer_read" ON public.jobs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin', 'reviewer'))
  );

-- Sessions: own sessions
CREATE POLICY "sessions_own" ON public.sessions
  FOR ALL USING (auth.uid() = user_id);

-- Devices: own devices
CREATE POLICY "devices_own" ON public.devices
  FOR ALL USING (auth.uid() = user_id);

-- Voice turns: via session ownership
CREATE POLICY "voice_turns_own" ON public.voice_turns
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = session_id AND s.user_id = auth.uid())
  );

-- Part specs: via job ownership
CREATE POLICY "part_specs_own" ON public.part_specs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND j.user_id = auth.uid())
  );

-- Concept variants: via job ownership
CREATE POLICY "concept_variants_own" ON public.concept_variants
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND j.user_id = auth.uid())
  );

-- CAD runs: via job ownership
CREATE POLICY "cad_runs_own" ON public.cad_runs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND j.user_id = auth.uid())
  );

-- Artifacts: via job ownership
CREATE POLICY "artifacts_own" ON public.artifacts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND j.user_id = auth.uid())
  );

-- Approvals: own or reviewer/admin
CREATE POLICY "approvals_own" ON public.approvals
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND j.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin', 'reviewer'))
  );

-- Print results: via job ownership
CREATE POLICY "print_results_own" ON public.print_results
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND j.user_id = auth.uid())
  );

-- Learning events: via job ownership
CREATE POLICY "learning_events_own" ON public.learning_events
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND j.user_id = auth.uid())
  );

-- Embeddings memory: via job ownership
CREATE POLICY "embeddings_memory_own" ON public.embeddings_memory
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND j.user_id = auth.uid())
  );

-- Eval runs: admin only
CREATE POLICY "eval_runs_admin" ON public.eval_runs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );
