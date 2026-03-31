-- Migration 007: Virtual Print Lab (VPL)
-- Adds the virtual_print_tests table to persist VPL results

CREATE TABLE IF NOT EXISTS public.virtual_print_tests (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id              UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    cad_run_id          UUID REFERENCES public.cad_runs(id) ON DELETE SET NULL,
    project_id          UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    stl_path            TEXT,

    -- Structured result payloads (jsonb for queryability)
    geometry_result     JSONB,
    slicer_result       JSONB,
    heuristic_result    JSONB,

    -- Computed score fields (denormalized for fast queries)
    print_success_score INTEGER CHECK (print_success_score >= 0 AND print_success_score <= 100),
    grade               TEXT CHECK (grade IN ('A', 'B', 'C', 'D', 'F')),
    ready_to_print      BOOLEAN DEFAULT FALSE,
    risk_level          TEXT CHECK (risk_level IN ('low', 'moderate', 'high')),
    score_breakdown     JSONB,

    -- Status tracking
    status              TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    error_text          TEXT,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_vpt_job_id     ON public.virtual_print_tests(job_id);
CREATE INDEX IF NOT EXISTS idx_vpt_user_id    ON public.virtual_print_tests(user_id);
CREATE INDEX IF NOT EXISTS idx_vpt_project_id ON public.virtual_print_tests(project_id);
CREATE INDEX IF NOT EXISTS idx_vpt_score      ON public.virtual_print_tests(print_success_score DESC);
CREATE INDEX IF NOT EXISTS idx_vpt_created_at ON public.virtual_print_tests(created_at DESC);

-- RLS: users can only see their own VPL results; service role bypasses
ALTER TABLE public.virtual_print_tests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own VPL results"
    ON public.virtual_print_tests FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Service role full access"
    ON public.virtual_print_tests FOR ALL
    USING (true)
    WITH CHECK (true);

-- Trigger to keep updated_at current
CREATE OR REPLACE FUNCTION public.update_vpt_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_vpt_updated_at
    BEFORE UPDATE ON public.virtual_print_tests
    FOR EACH ROW EXECUTE FUNCTION public.update_vpt_updated_at();
