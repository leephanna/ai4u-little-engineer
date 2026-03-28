-- ============================================================
-- Migration 004: Harmonia Phase 2 — Multi-AI Governance Layer
-- ============================================================
-- New tables: intelligence_debates, tolerance_insights
-- Upgrades: capability_candidates (governance lifecycle)
-- ============================================================

-- ── 1. intelligence_debates ────────────────────────────────
-- Immutable log of every multi-AI proposal/critique/consensus cycle.
CREATE TABLE IF NOT EXISTS public.intelligence_debates (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_type            text NOT NULL CHECK (
                          topic_type IN (
                            'prompt_improvement',
                            'capability_proposal',
                            'tolerance_rule',
                            'validation_update'
                          )
                        ),
  source_record_ids     jsonb NOT NULL DEFAULT '[]',
  -- Proposer
  proposer_model        text NOT NULL,
  proposer_provider     text NOT NULL,
  proposer_output       jsonb NOT NULL DEFAULT '{}',
  proposer_tokens       integer,
  proposer_latency_ms   integer,
  -- Critic
  critic_model          text NOT NULL,
  critic_provider       text NOT NULL,
  critic_output         jsonb NOT NULL DEFAULT '{}',
  critic_tokens         integer,
  critic_latency_ms     integer,
  -- Judge / Consensus
  judge_model           text NOT NULL,
  judge_provider        text NOT NULL,
  consensus_output      jsonb NOT NULL DEFAULT '{}',
  judge_tokens          integer,
  judge_latency_ms      integer,
  -- Outcome
  final_recommendation  text NOT NULL CHECK (
                          final_recommendation IN (
                            'approve_eval',
                            'reject',
                            'human_review'
                          )
                        ),
  risk_score            double precision CHECK (risk_score >= 0 AND risk_score <= 1),
  novelty_score         double precision CHECK (novelty_score >= 0 AND novelty_score <= 1),
  -- Link to downstream record (prompt_version_id, capability_candidate_id, etc.)
  linked_record_id      uuid,
  linked_record_type    text,
  -- Cost tracking
  total_tokens          integer,
  estimated_cost_usd    double precision,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- Index for querying by topic type and outcome
CREATE INDEX IF NOT EXISTS idx_intelligence_debates_topic
  ON public.intelligence_debates (topic_type, final_recommendation, created_at DESC);

-- ── 2. tolerance_insights ──────────────────────────────────
-- Proposed adjustments to CAD geometry based on print feedback patterns.
CREATE TABLE IF NOT EXISTS public.tolerance_insights (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family                text NOT NULL,
  dimension_name        text NOT NULL,
  condition_context     jsonb NOT NULL DEFAULT '{}',
  -- e.g. {"printer": "Bambu X1", "material": "PLA", "layer_height_mm": 0.2}
  suggested_adjustment  double precision NOT NULL,
  -- mm offset to apply (positive = add, negative = subtract)
  adjustment_unit       text NOT NULL DEFAULT 'mm',
  confidence_score      double precision NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),
  evidence_count        integer NOT NULL DEFAULT 0,
  evidence_record_ids   jsonb NOT NULL DEFAULT '[]',
  -- print_feedback row IDs that support this insight
  status                text NOT NULL DEFAULT 'proposed' CHECK (
                          status IN (
                            'proposed',
                            'evaluating',
                            'approved',
                            'rejected',
                            'superseded'
                          )
                        ),
  -- Debate reference
  debate_id             uuid REFERENCES public.intelligence_debates(id),
  -- Operator review
  reviewed_by           uuid,
  reviewed_at           timestamptz,
  review_notes          text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tolerance_insights_family_status
  ON public.tolerance_insights (family, status, created_at DESC);

-- ── 3. Upgrade capability_candidates ──────────────────────
-- Add governance lifecycle fields to the existing table.
-- (Use ALTER TABLE ... ADD COLUMN IF NOT EXISTS for idempotency)

ALTER TABLE public.capability_candidates
  ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'proposed'
    CHECK (lifecycle_status IN (
      'proposed', 'candidate', 'lab', 'approved_for_implementation', 'production'
    )),
  ADD COLUMN IF NOT EXISTS business_value_score double precision,
  ADD COLUMN IF NOT EXISTS implementation_complexity text
    CHECK (implementation_complexity IN ('low', 'medium', 'high', 'very_high')),
  ADD COLUMN IF NOT EXISTS risk_level text
    CHECK (risk_level IN ('low', 'medium', 'high')),
  ADD COLUMN IF NOT EXISTS autonomous_template_eligible boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS demand_frequency integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS example_transcripts jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS required_dimensions jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS likely_validation_rules jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS debate_id uuid REFERENCES public.intelligence_debates(id),
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_notes text;

-- ── 4. Upgrade prompt_versions ────────────────────────────
-- Add debate reference and stronger eval fields.
ALTER TABLE public.prompt_versions
  ADD COLUMN IF NOT EXISTS debate_id uuid REFERENCES public.intelligence_debates(id),
  ADD COLUMN IF NOT EXISTS eval_suite_version text DEFAULT 'v1',
  ADD COLUMN IF NOT EXISTS eval_results_json jsonb,
  ADD COLUMN IF NOT EXISTS eval_score double precision,
  ADD COLUMN IF NOT EXISTS eval_passed boolean,
  ADD COLUMN IF NOT EXISTS regression_risk_score double precision,
  ADD COLUMN IF NOT EXISTS promoted_by text DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS promoted_at timestamptz;

-- ── 5. Upgrade user_design_profiles ───────────────────────
-- Add adaptive behavior fields.
ALTER TABLE public.user_design_profiles
  ADD COLUMN IF NOT EXISTS inferred_experience_level text DEFAULT 'beginner'
    CHECK (inferred_experience_level IN ('beginner', 'intermediate', 'expert')),
  ADD COLUMN IF NOT EXISTS preferred_materials jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS preferred_tolerance_style text DEFAULT 'standard'
    CHECK (preferred_tolerance_style IN ('tight', 'standard', 'loose')),
  ADD COLUMN IF NOT EXISTS clarification_verbosity text DEFAULT 'standard'
    CHECK (clarification_verbosity IN ('minimal', 'standard', 'verbose')),
  ADD COLUMN IF NOT EXISTS session_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_generations integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_active_at timestamptz;

-- ── 6. decision_ledger: allow new step types ──────────────
-- Drop the old CHECK constraint and replace with a broader one.
ALTER TABLE public.decision_ledger
  DROP CONSTRAINT IF EXISTS decision_ledger_step_check;

ALTER TABLE public.decision_ledger
  ADD CONSTRAINT decision_ledger_step_check CHECK (
    step IN (
      'interpret', 'clarify', 'confirm', 'generate',
      'score', 'cluster', 'promote',
      'debate_propose', 'debate_critique', 'debate_judge',
      'tolerance_propose', 'tolerance_approve',
      'capability_propose', 'capability_approve',
      'eval_prompt', 'propose_new_capability'
    )
  );
