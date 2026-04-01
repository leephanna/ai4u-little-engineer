-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 008: Trust Policy Engine
-- ─────────────────────────────────────────────────────────────────────────────
-- Adds the trust_policy_decisions table and extends the projects table with
-- trust tier columns for marketplace gating and KeyGuardian priority routing.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. trust_policy_decisions — persists every policy evaluation result
CREATE TABLE IF NOT EXISTS public.trust_policy_decisions (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Foreign keys to existing tables
    project_id              UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    job_id                  UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
    vpl_test_id             UUID REFERENCES public.virtual_print_tests(id) ON DELETE SET NULL,

    -- Core trust decision
    trust_tier              TEXT NOT NULL
                                CHECK (trust_tier IN (
                                    'unverified', 'low_confidence', 'verified', 'trusted_commercial'
                                )),

    -- Marketplace permissions derived from trust tier
    marketplace_allowed     BOOLEAN NOT NULL DEFAULT FALSE,
    public_listing_allowed  BOOLEAN NOT NULL DEFAULT FALSE,

    -- Operational flags
    requires_operator_review BOOLEAN NOT NULL DEFAULT FALSE,

    -- KeyGuardian directives
    rotation_priority       TEXT NOT NULL DEFAULT 'standard'
                                CHECK (rotation_priority IN ('critical', 'high', 'standard', 'low')),
    monitoring_level        TEXT NOT NULL DEFAULT 'standard'
                                CHECK (monitoring_level IN ('elevated', 'standard', 'minimal')),

    -- Full audit trail stored as JSONB for queryability
    decision_inputs         JSONB NOT NULL DEFAULT '{}'::jsonb,
    decision_output         JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Notes / reasoning (denormalized for fast display in operator console)
    notes                   TEXT[] NOT NULL DEFAULT '{}',

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_tpd_project_id
    ON public.trust_policy_decisions(project_id);
CREATE INDEX IF NOT EXISTS idx_tpd_job_id
    ON public.trust_policy_decisions(job_id);
CREATE INDEX IF NOT EXISTS idx_tpd_vpl_test_id
    ON public.trust_policy_decisions(vpl_test_id);
CREATE INDEX IF NOT EXISTS idx_tpd_trust_tier
    ON public.trust_policy_decisions(trust_tier);
CREATE INDEX IF NOT EXISTS idx_tpd_rotation_priority
    ON public.trust_policy_decisions(rotation_priority);
CREATE INDEX IF NOT EXISTS idx_tpd_created_at
    ON public.trust_policy_decisions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tpd_requires_review
    ON public.trust_policy_decisions(requires_operator_review) WHERE requires_operator_review = TRUE;

-- RLS: service role full access; users can view decisions for their own projects
ALTER TABLE public.trust_policy_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on trust_policy_decisions"
    ON public.trust_policy_decisions FOR ALL
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Users can view trust decisions for their projects"
    ON public.trust_policy_decisions FOR SELECT
    USING (
        project_id IN (
            SELECT id FROM public.projects WHERE user_id = auth.uid()
        )
    );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Extend projects table with trust tier columns
-- ─────────────────────────────────────────────────────────────────────────────
-- These denormalized columns allow fast marketplace gating without joining
-- to trust_policy_decisions on every request.

ALTER TABLE public.projects
    ADD COLUMN IF NOT EXISTS trust_tier              TEXT DEFAULT NULL
                                CHECK (trust_tier IN (
                                    'unverified', 'low_confidence', 'verified', 'trusted_commercial'
                                )),
    ADD COLUMN IF NOT EXISTS marketplace_allowed     BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS trust_evaluated_at      TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS vpl_grade               TEXT DEFAULT NULL
                                CHECK (vpl_grade IN ('A', 'B', 'C', 'D', 'F')),
    ADD COLUMN IF NOT EXISTS print_success_score     INTEGER DEFAULT NULL
                                CHECK (print_success_score >= 0 AND print_success_score <= 100);

-- Index for marketplace gating queries
CREATE INDEX IF NOT EXISTS idx_projects_trust_tier
    ON public.projects(trust_tier) WHERE trust_tier IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_projects_marketplace_allowed
    ON public.projects(marketplace_allowed) WHERE marketplace_allowed = TRUE;
CREATE INDEX IF NOT EXISTS idx_projects_vpl_grade
    ON public.projects(vpl_grade) WHERE vpl_grade IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Helper view: operator console trust summary
-- ─────────────────────────────────────────────────────────────────────────────
-- Joins VPL results with trust decisions for the admin console.

CREATE OR REPLACE VIEW public.v_operator_trust_summary AS
SELECT
    tpd.id                      AS decision_id,
    tpd.created_at              AS decided_at,
    tpd.trust_tier,
    tpd.marketplace_allowed,
    tpd.public_listing_allowed,
    tpd.requires_operator_review,
    tpd.rotation_priority,
    tpd.monitoring_level,
    tpd.notes,
    tpd.project_id,
    tpd.job_id,
    tpd.vpl_test_id,
    -- VPL fields
    vpt.print_success_score,
    vpt.grade                   AS vpl_grade,
    vpt.ready_to_print,
    vpt.risk_level,
    vpt.all_issues,
    vpt.created_at              AS vpl_tested_at,
    -- Project fields
    p.title                     AS project_title,
    p.is_public,
    p.price,
    p.earnings_total
FROM public.trust_policy_decisions tpd
LEFT JOIN public.virtual_print_tests vpt ON tpd.vpl_test_id = vpt.id
LEFT JOIN public.projects p ON tpd.project_id = p.id
ORDER BY tpd.created_at DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Helper view: KeyGuardian priority routing
-- ─────────────────────────────────────────────────────────────────────────────
-- Surfaces projects with elevated rotation priority for KeyGuardian.

CREATE OR REPLACE VIEW public.v_keyguardian_priority AS
SELECT DISTINCT ON (tpd.project_id)
    tpd.project_id,
    p.title                     AS project_title,
    p.is_public,
    p.price,
    p.earnings_total,
    tpd.trust_tier,
    tpd.rotation_priority,
    tpd.monitoring_level,
    tpd.requires_operator_review,
    tpd.created_at              AS last_evaluated_at
FROM public.trust_policy_decisions tpd
LEFT JOIN public.projects p ON tpd.project_id = p.id
ORDER BY tpd.project_id, tpd.created_at DESC;
