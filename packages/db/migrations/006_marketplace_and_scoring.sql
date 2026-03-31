-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 006: Marketplace Layer + Print Success Score
-- ─────────────────────────────────────────────────────────────────────────────
-- Adds marketplace monetization columns and success scoring to projects table.
-- Also adds a design_purchases table for tracking paid design unlocks.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add marketplace and scoring columns to projects
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS price              NUMERIC(10,2) DEFAULT NULL,      -- NULL = free
  ADD COLUMN IF NOT EXISTS is_public          BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS creator_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS earnings_total     NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS success_score      NUMERIC(5,2) DEFAULT NULL,       -- 0.00–100.00
  ADD COLUMN IF NOT EXISTS success_rate       NUMERIC(5,2) DEFAULT NULL,       -- 0.00–100.00 (%)
  ADD COLUMN IF NOT EXISTS successful_prints  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failed_prints      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS best_material      TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS best_printer       TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS score_updated_at   TIMESTAMPTZ DEFAULT NULL;

-- 2. Indexes for marketplace queries
CREATE INDEX IF NOT EXISTS idx_projects_price
  ON public.projects(price) WHERE price IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_projects_success_score
  ON public.projects(success_score DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_projects_is_public
  ON public.projects(is_public) WHERE is_public = true;

CREATE INDEX IF NOT EXISTS idx_projects_creator
  ON public.projects(creator_id);

CREATE INDEX IF NOT EXISTS idx_projects_earnings
  ON public.projects(earnings_total DESC);

-- 3. design_purchases — tracks who has paid to unlock a design
CREATE TABLE IF NOT EXISTS public.design_purchases (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  buyer_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_session_id   TEXT NOT NULL,
  stripe_payment_id   TEXT,
  amount_paid         NUMERIC(10,2) NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'usd',
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'completed', 'refunded')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at        TIMESTAMPTZ DEFAULT NULL,
  UNIQUE(project_id, buyer_id)  -- one purchase per user per design
);

CREATE INDEX IF NOT EXISTS idx_design_purchases_buyer
  ON public.design_purchases(buyer_id);

CREATE INDEX IF NOT EXISTS idx_design_purchases_project
  ON public.design_purchases(project_id);

CREATE INDEX IF NOT EXISTS idx_design_purchases_session
  ON public.design_purchases(stripe_session_id);

ALTER TABLE public.design_purchases ENABLE ROW LEVEL SECURITY;

-- Buyers can see their own purchases
CREATE POLICY "Users read own purchases"
  ON public.design_purchases FOR SELECT
  USING (auth.uid() = buyer_id);

-- Service role can insert/update purchases (webhook)
-- No user-level insert policy — only the webhook can create purchase records

-- 4. invention_requests — audit log for the auto-invention engine
CREATE TABLE IF NOT EXISTS public.invention_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  problem_text    TEXT NOT NULL,
  family          TEXT,
  parameters      JSONB DEFAULT '{}'::jsonb,
  reasoning       TEXT,
  confidence      NUMERIC(3,2) DEFAULT NULL,
  project_id      UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  job_id          UUID DEFAULT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'generating', 'completed', 'failed', 'rejected')),
  rejection_reason TEXT DEFAULT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_invention_requests_user
  ON public.invention_requests(user_id);

CREATE INDEX IF NOT EXISTS idx_invention_requests_status
  ON public.invention_requests(status);

ALTER TABLE public.invention_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own inventions"
  ON public.invention_requests FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own inventions"
  ON public.invention_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);
