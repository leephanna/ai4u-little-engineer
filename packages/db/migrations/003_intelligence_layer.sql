-- ─────────────────────────────────────────────────────────────
-- Migration 003: Intelligence Layer
-- AI4U Little Engineer — Self-Improving Design Intelligence
-- ─────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────
-- 1. design_learning_records
-- Populated after every job completion or failure.
-- Zero-blocking: all writes are fire-and-forget async.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.design_learning_records (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  job_id               UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  transcript           TEXT,
  parsed_intent        JSONB,
  final_spec           JSONB,
  spec_corrections     JSONB DEFAULT '[]'::jsonb,
  clarification_count  INTEGER DEFAULT 0,
  model_version        TEXT DEFAULT 'gpt-4.1-mini',
  prompt_version       TEXT DEFAULT 'v1.0',
  generation_status    TEXT,
  validation_metrics   JSONB DEFAULT '{}'::jsonb,
  artifacts_generated  JSONB DEFAULT '[]'::jsonb,
  download_triggered   BOOLEAN DEFAULT FALSE,
  regeneration_count   INTEGER DEFAULT 0,
  completion_time_ms   INTEGER,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dlr_user_id  ON public.design_learning_records(user_id);
CREATE INDEX IF NOT EXISTS idx_dlr_job_id   ON public.design_learning_records(job_id);
CREATE INDEX IF NOT EXISTS idx_dlr_status   ON public.design_learning_records(generation_status);
CREATE INDEX IF NOT EXISTS idx_dlr_created  ON public.design_learning_records(created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- 2. capability_registry
-- Single source of truth for part families and their dimension contracts.
-- ALL dimension requirements MUST come from this table — never hardcoded.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.capability_registry (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family              TEXT UNIQUE NOT NULL,
  required_dimensions JSONB NOT NULL DEFAULT '[]'::jsonb,
  optional_dimensions JSONB NOT NULL DEFAULT '[]'::jsonb,
  validation_rules    JSONB NOT NULL DEFAULT '{}'::jsonb,
  question_strategy   JSONB NOT NULL DEFAULT '{}'::jsonb,
  generator_version   TEXT NOT NULL DEFAULT '0.9.0',
  success_rate        FLOAT DEFAULT 1.0,
  approval_rate       FLOAT DEFAULT 1.0,
  print_success_rate  FLOAT DEFAULT 1.0,
  maturity_level      TEXT NOT NULL DEFAULT 'proven'
                        CHECK (maturity_level IN ('proven','candidate','experimental')),
  usage_count         INTEGER DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cr_family   ON public.capability_registry(family);
CREATE INDEX IF NOT EXISTS idx_cr_maturity ON public.capability_registry(maturity_level);

-- ─────────────────────────────────────────────────────────────
-- 3. prompt_versions
-- Versioned prompt texts for the interpret-voice NLU system.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prompt_versions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         TEXT NOT NULL,
  version      TEXT NOT NULL,
  prompt_text  TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'candidate'
                 CHECK (status IN ('candidate','production','retired')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (name, version)
);

CREATE INDEX IF NOT EXISTS idx_pv_name_status ON public.prompt_versions(name, status);

-- ─────────────────────────────────────────────────────────────
-- 4. prompt_eval_results
-- Stores evaluation scores for each prompt version against test cases.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prompt_eval_results (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prompt_version_id UUID NOT NULL REFERENCES public.prompt_versions(id) ON DELETE CASCADE,
  test_case         TEXT NOT NULL,
  expected_output   JSONB NOT NULL,
  actual_output     JSONB,
  score             FLOAT,
  passed            BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_per_prompt_version ON public.prompt_eval_results(prompt_version_id);

-- ─────────────────────────────────────────────────────────────
-- 5. capability_candidates
-- Detected unmet part family requests from learning records.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.capability_candidates (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inferred_family  TEXT NOT NULL,
  frequency        INTEGER DEFAULT 1,
  example_specs    JSONB DEFAULT '[]'::jsonb,
  confidence_score FLOAT DEFAULT 0.0,
  status           TEXT NOT NULL DEFAULT 'candidate'
                     CHECK (status IN ('candidate','approved','rejected')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- 6. print_feedback
-- User-submitted feedback after downloading and printing artifacts.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.print_feedback (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id      UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  printed     BOOLEAN DEFAULT FALSE,
  fit_result  TEXT CHECK (fit_result IN ('perfect','tight','loose','failed')),
  material    TEXT,
  printer     TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pf_job_id  ON public.print_feedback(job_id);
CREATE INDEX IF NOT EXISTS idx_pf_user_id ON public.print_feedback(user_id);

-- ─────────────────────────────────────────────────────────────
-- 7. user_design_profiles
-- Per-user learned preferences and correction patterns.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_design_profiles (
  user_id             UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  preferred_units     TEXT DEFAULT 'mm',
  common_families     JSONB DEFAULT '[]'::jsonb,
  avg_dimensions      JSONB DEFAULT '{}'::jsonb,
  correction_patterns JSONB DEFAULT '{}'::jsonb,
  last_updated        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- 8. decision_ledger
-- Immutable log of every major decision in the pipeline.
-- Append-only: no updates, no deletes.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.decision_ledger (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id          UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  step            TEXT NOT NULL CHECK (step IN ('interpret','clarify','confirm','generate','score','cluster','promote')),
  decision_reason TEXT,
  inputs          JSONB DEFAULT '{}'::jsonb,
  outputs         JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dl_job_id  ON public.decision_ledger(job_id);
CREATE INDEX IF NOT EXISTS idx_dl_step    ON public.decision_ledger(step);
CREATE INDEX IF NOT EXISTS idx_dl_created ON public.decision_ledger(created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- SEED: capability_registry — all 10 MVP part families
-- ─────────────────────────────────────────────────────────────
INSERT INTO public.capability_registry (family, required_dimensions, optional_dimensions, validation_rules, question_strategy, generator_version, maturity_level)
VALUES
  ('spacer',
   '["outer_diameter","inner_diameter","length"]'::jsonb,
   '["chamfer"]'::jsonb,
   '{"outer_diameter":{"min":2,"max":200},"inner_diameter":{"min":1,"max":199},"length":{"min":1,"max":500},"rule_inner_lt_outer":"inner_diameter < outer_diameter"}'::jsonb,
   '{"first_question":"What outer diameter do you need?","second_question":"What inner diameter (bore size)?","third_question":"How long should the spacer be?"}'::jsonb,
   '0.9.0', 'proven'),

  ('flat_bracket',
   '["length","width","thickness","hole_count","hole_diameter"]'::jsonb,
   '["countersink"]'::jsonb,
   '{"length":{"min":5,"max":500},"width":{"min":5,"max":500},"thickness":{"min":1,"max":20},"hole_count":{"min":1,"max":50},"hole_diameter":{"min":1,"max":50}}'::jsonb,
   '{"first_question":"What length and width do you need?","second_question":"How thick should it be?","third_question":"How many holes, and what diameter?"}'::jsonb,
   '0.9.0', 'proven'),

  ('l_bracket',
   '["leg_a","leg_b","thickness","width"]'::jsonb,
   '["fillet_radius"]'::jsonb,
   '{"leg_a":{"min":5,"max":300},"leg_b":{"min":5,"max":300},"thickness":{"min":1,"max":20},"width":{"min":5,"max":200}}'::jsonb,
   '{"first_question":"What are the two leg lengths?","second_question":"How thick and wide?"}'::jsonb,
   '0.9.0', 'proven'),

  ('u_bracket',
   '["pipe_od","wall_thickness","flange_width","flange_length"]'::jsonb,
   '[]'::jsonb,
   '{"pipe_od":{"min":5,"max":200},"wall_thickness":{"min":1,"max":20},"flange_width":{"min":5,"max":100},"flange_length":{"min":5,"max":200}}'::jsonb,
   '{"first_question":"What pipe or tube outer diameter are you clamping?","second_question":"What wall thickness and flange dimensions?"}'::jsonb,
   '0.9.0', 'proven'),

  ('hole_plate',
   '["length","width","thickness","hole_count","hole_diameter"]'::jsonb,
   '["hole_spacing"]'::jsonb,
   '{"length":{"min":5,"max":500},"width":{"min":5,"max":500},"thickness":{"min":1,"max":30},"hole_count":{"min":1,"max":100},"hole_diameter":{"min":1,"max":50}}'::jsonb,
   '{"first_question":"What plate dimensions do you need?","second_question":"How many holes and what diameter?"}'::jsonb,
   '0.9.0', 'proven'),

  ('standoff_block',
   '["length","width","height","hole_diameter"]'::jsonb,
   '["through_hole"]'::jsonb,
   '{"length":{"min":3,"max":200},"width":{"min":3,"max":200},"height":{"min":3,"max":200},"hole_diameter":{"min":1,"max":50}}'::jsonb,
   '{"first_question":"What are the block dimensions (length, width, height)?","second_question":"What hole diameter?"}'::jsonb,
   '0.9.0', 'proven'),

  ('cable_clip',
   '["cable_od","wall_thickness","base_width"]'::jsonb,
   '["snap_fit"]'::jsonb,
   '{"cable_od":{"min":1,"max":50},"wall_thickness":{"min":0.5,"max":10},"base_width":{"min":3,"max":50}}'::jsonb,
   '{"first_question":"What cable or wire outer diameter?","second_question":"Wall thickness and base width?"}'::jsonb,
   '0.9.0', 'proven'),

  ('enclosure',
   '["inner_length","inner_width","inner_height","wall_thickness"]'::jsonb,
   '["lid","ventilation_holes"]'::jsonb,
   '{"inner_length":{"min":10,"max":500},"inner_width":{"min":10,"max":500},"inner_height":{"min":10,"max":500},"wall_thickness":{"min":1,"max":20}}'::jsonb,
   '{"first_question":"What inner dimensions do you need (L x W x H)?","second_question":"How thick should the walls be?"}'::jsonb,
   '0.9.0', 'proven'),

  ('adapter_bushing',
   '["outer_diameter","inner_diameter","length"]'::jsonb,
   '["flange"]'::jsonb,
   '{"outer_diameter":{"min":2,"max":200},"inner_diameter":{"min":1,"max":199},"length":{"min":2,"max":200},"rule_inner_lt_outer":"inner_diameter < outer_diameter"}'::jsonb,
   '{"first_question":"What outer diameter?","second_question":"What inner bore diameter?","third_question":"How long?"}'::jsonb,
   '0.9.0', 'proven'),

  ('simple_jig',
   '["length","width","height"]'::jsonb,
   '["locating_pins","slots"]'::jsonb,
   '{"length":{"min":5,"max":500},"width":{"min":5,"max":500},"height":{"min":2,"max":200}}'::jsonb,
   '{"first_question":"What overall dimensions does the jig need (L x W x H)?"}'::jsonb,
   '0.9.0', 'proven')

ON CONFLICT (family) DO UPDATE SET
  required_dimensions = EXCLUDED.required_dimensions,
  optional_dimensions = EXCLUDED.optional_dimensions,
  validation_rules    = EXCLUDED.validation_rules,
  question_strategy   = EXCLUDED.question_strategy,
  generator_version   = EXCLUDED.generator_version;

-- ─────────────────────────────────────────────────────────────
-- SEED: prompt_versions — initial production NLU prompt
-- ─────────────────────────────────────────────────────────────
INSERT INTO public.prompt_versions (name, version, prompt_text, status)
VALUES (
  'interpret_voice_nlu',
  'v1.0',
  'You are a mechanical engineering assistant helping a user design a 3D-printable part.
Extract the user''s intent from the transcript below and return a JSON object with:
- intent: one of [specify_part, provide_dimensions, confirm, cancel, unknown]
- family: the part family if identified (spacer, flat_bracket, l_bracket, u_bracket, hole_plate, standoff_block, cable_clip, enclosure, adapter_bushing, simple_jig)
- dimensions: object with any extracted dimension values (use plain keys like outer_diameter, not outer_diameter_mm)
- units: "mm" or "in" (default "mm" if not specified)
- confidence: float 0-1
- message: a natural, friendly response to speak back to the user

Rules:
- Only extract dimensions explicitly stated by the user
- If a dimension is ambiguous, ask for clarification in the message field
- Never assume dimensions not stated
- If the user says "confirm" or "yes" or "looks good", set intent to "confirm"
- If the user says "cancel" or "start over", set intent to "cancel"',
  'production'
)
ON CONFLICT (name, version) DO NOTHING;
