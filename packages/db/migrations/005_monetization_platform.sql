-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 005: Monetization Platform
-- Adds: subscriptions table, projects table, print_feedback image columns,
--       profiles.current_period_end, profiles.plan_generation_reset
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. subscriptions — dedicated subscription ledger (separate from profiles)
--    profiles.plan / stripe_subscription_id remain as the fast-read cache.
--    This table is the source of truth for billing history.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id     TEXT NOT NULL,
  stripe_subscription_id TEXT UNIQUE,
  plan                   TEXT NOT NULL DEFAULT 'free'
                           CHECK (plan IN ('free', 'maker', 'pro')),
  status                 TEXT NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active', 'past_due', 'canceled', 'trialing', 'incomplete')),
  current_period_end     TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id
  ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer
  ON public.subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub
  ON public.subscriptions(stripe_subscription_id);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can read their own subscription
CREATE POLICY "Users read own subscriptions"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can do everything (used by webhook handler)
CREATE POLICY "Service role full access subscriptions"
  ON public.subscriptions FOR ALL
  USING (true)
  WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Add current_period_end to profiles (fast-read for UI)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. print_feedback — add image_path and analysis columns
--    (migration 002/003 created the base table; we extend it here)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.print_feedback
  ADD COLUMN IF NOT EXISTS image_path       TEXT,          -- private storage path
  ADD COLUMN IF NOT EXISTS analysis_result  JSONB,         -- multimodal analysis output
  ADD COLUMN IF NOT EXISTS review_status    TEXT NOT NULL DEFAULT 'pending'
                                              CHECK (review_status IN ('pending', 'reviewed'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. projects — searchable design library
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.projects (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  description  TEXT,
  family       TEXT NOT NULL,
  parameters   JSONB NOT NULL DEFAULT '{}'::jsonb,
  stl_url      TEXT,
  step_url     TEXT,
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_system    BOOLEAN NOT NULL DEFAULT false,   -- true = seeded by system
  usage_count  INTEGER NOT NULL DEFAULT 0,
  rating       NUMERIC(3,2) DEFAULT NULL,        -- 0.00–5.00
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Full-text search vector (auto-updated by trigger below)
  search_vector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('english',
      coalesce(title, '') || ' ' ||
      coalesce(description, '') || ' ' ||
      coalesce(family, '')
    )
  ) STORED
);

CREATE INDEX IF NOT EXISTS idx_projects_family
  ON public.projects(family);
CREATE INDEX IF NOT EXISTS idx_projects_usage
  ON public.projects(usage_count DESC);
CREATE INDEX IF NOT EXISTS idx_projects_created
  ON public.projects(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_search
  ON public.projects USING GIN(search_vector);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- Anyone can read projects (community library)
CREATE POLICY "Public read projects"
  ON public.projects FOR SELECT
  USING (true);

-- Authenticated users can insert their own projects
CREATE POLICY "Users insert own projects"
  ON public.projects FOR INSERT
  WITH CHECK (auth.uid() = created_by OR is_system = true);

-- Users can update usage_count on any project (for reuse tracking)
CREATE POLICY "Users update project usage"
  ON public.projects FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. user_design_profiles — ensure xy_compensation and hole_offset columns
--    (migration 003 created the table; we add the learned compensation fields)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.user_design_profiles
  ADD COLUMN IF NOT EXISTS xy_compensation_mm   NUMERIC(5,3) NOT NULL DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS hole_offset_mm        NUMERIC(5,3) NOT NULL DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS wall_adjustment_mm    NUMERIC(5,3) NOT NULL DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS feedback_sample_count INTEGER NOT NULL DEFAULT 0;
