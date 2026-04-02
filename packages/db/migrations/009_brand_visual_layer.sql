-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 009: Brand + Visual Layer
-- Adds:
--   1. project_images table — stores AI-generated concept renders and context images
--   2. Legal metadata columns on projects — origin, validated, validated_at
--   3. share_card_url on jobs — cached shareable preview card image URL
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. project_images table
CREATE TABLE IF NOT EXISTS project_images (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  image_type    TEXT NOT NULL CHECK (image_type IN ('render', 'context')),
  url           TEXT NOT NULL,
  prompt        TEXT,                     -- the prompt used to generate the image
  model         TEXT DEFAULT 'dall-e-3',  -- generation model
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_images_project_id ON project_images(project_id);
CREATE INDEX IF NOT EXISTS idx_project_images_type ON project_images(image_type);

-- Row-level security: images are readable by anyone (public assets)
ALTER TABLE project_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_images_public_read"
  ON project_images FOR SELECT
  USING (true);

CREATE POLICY "project_images_service_write"
  ON project_images FOR INSERT
  WITH CHECK (true);

-- 2. Legal metadata on projects
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS origin        TEXT DEFAULT 'ai_generated',
  ADD COLUMN IF NOT EXISTS validated     BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS validated_at  TIMESTAMPTZ;

-- Backfill: mark all projects that have a VPL grade as validated
UPDATE projects
SET
  validated    = true,
  validated_at = updated_at
WHERE vpl_grade IS NOT NULL
  AND validated IS DISTINCT FROM true;

-- 3. share_card_url on jobs (cached OG image for social sharing)
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS share_card_url TEXT;

-- 4. patent_summary on jobs (Invention Protection Mode)
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS patent_summary_json JSONB;
