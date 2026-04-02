-- Migration 010: Universal Intake System
-- Adds tables for multimodal intake sessions and uploaded files

-- Intake sessions: tracks the full multimodal conversation before a job is created
CREATE TABLE IF NOT EXISTS intake_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Current interpretation state
  mode TEXT,                        -- parametric_part | image_to_relief | image_to_replica | svg_to_extrusion | document_to_model_reference | concept_invention | needs_clarification
  family_candidate TEXT,            -- detected part family
  extracted_dimensions JSONB DEFAULT '{}'::jsonb,
  inferred_scale TEXT,
  inferred_object_type TEXT,
  missing_information TEXT[],
  assistant_message TEXT,
  preview_strategy TEXT,
  confidence FLOAT DEFAULT 0,

  -- Conversation history (array of {role, content} objects)
  conversation_history JSONB DEFAULT '[]'::jsonb,

  -- Linked job (set once the user confirms and generation starts)
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,

  -- Status
  status TEXT NOT NULL DEFAULT 'active'  -- active | confirmed | abandoned
);

-- Uploaded files: stores file metadata and base64 content for intake sessions
CREATE TABLE IF NOT EXISTS intake_uploaded_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES intake_sessions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,           -- MIME type
  file_size_bytes INTEGER NOT NULL,
  data_url TEXT NOT NULL,            -- base64 data URL (stored for interpretation)

  -- File understanding results
  file_category TEXT,                -- image | document | svg | unknown
  interpretation TEXT,               -- flat_relief | lithophane | silhouette | reference_spec | sketch | logo | project_brief | insufficient
  analysis_notes TEXT,               -- LLM notes about the file content
  analyzed_at TIMESTAMPTZ
);

-- Artemis II demo configurations
CREATE TABLE IF NOT EXISTS artemis_demo_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  printer_make TEXT NOT NULL,
  printer_model TEXT NOT NULL,
  material TEXT NOT NULL,
  quality_preset TEXT NOT NULL,      -- draft | standard | fine
  scale_preset TEXT NOT NULL,        -- small | medium | display

  -- Generated configuration
  part_family TEXT,
  parameters JSONB DEFAULT '{}'::jsonb,
  estimated_print_time_minutes INTEGER,
  estimated_filament_g FLOAT,
  vpl_score FLOAT,
  trust_tier TEXT,

  -- Linked job (if user clicked GO)
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_intake_sessions_user_id ON intake_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_intake_sessions_status ON intake_sessions(status);
CREATE INDEX IF NOT EXISTS idx_intake_uploaded_files_session_id ON intake_uploaded_files(session_id);
CREATE INDEX IF NOT EXISTS idx_artemis_demo_configs_created ON artemis_demo_configs(created_at DESC);

-- RLS policies
ALTER TABLE intake_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_uploaded_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE artemis_demo_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own intake sessions"
  ON intake_sessions FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own uploaded files"
  ON intake_uploaded_files FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own demo configs"
  ON artemis_demo_configs FOR ALL
  USING (true);  -- demo configs are not user-restricted
