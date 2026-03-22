-- AI4U Little Engineer — Seed Data
-- Demo data for development and testing.
-- NOTE: Run schema.sql first.
--
-- IMPORTANT: The demo user UUIDs used here must correspond to real rows
-- in auth.users. In Supabase, create two users via the Auth dashboard
-- (or the Supabase CLI) with these UUIDs before running this seed:
--   - 00000000-0000-0000-0000-000000000001  (demo@ai4u.dev)
--   - 00000000-0000-0000-0000-000000000002  (admin@ai4u.dev)
--
-- The public.users table was removed in schema v4. All tables now
-- reference auth.users(id) directly.

-- ─────────────────────────────────────────────────────────────
-- Demo session
-- ─────────────────────────────────────────────────────────────
INSERT INTO public.sessions (id, user_id)
VALUES
  (
    '00000000-0000-0000-0000-000000000020',
    '00000000-0000-0000-0000-000000000001'
  )
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- Demo job
-- ─────────────────────────────────────────────────────────────
INSERT INTO public.jobs (
  id, user_id, session_id, title, status,
  requested_family, selected_family, confidence_score, latest_spec_version
)
VALUES
  (
    '00000000-0000-0000-0000-000000000030',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000020',
    'U-Bracket for 2-inch pipe',
    'approved',
    'u_bracket', 'u_bracket', 0.92, 1
  )
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- Demo voice turns
-- ─────────────────────────────────────────────────────────────
INSERT INTO public.voice_turns (session_id, job_id, speaker, transcript_text)
VALUES
  (
    '00000000-0000-0000-0000-000000000020',
    '00000000-0000-0000-0000-000000000030',
    'user',
    'I need a U-bracket for a 2-inch pipe with two quarter-inch mounting holes.'
  ),
  (
    '00000000-0000-0000-0000-000000000020',
    '00000000-0000-0000-0000-000000000030',
    'assistant',
    'Got it. What material would you like — PLA, PETG, or ABS? And how thick should the walls be?'
  ),
  (
    '00000000-0000-0000-0000-000000000020',
    '00000000-0000-0000-0000-000000000030',
    'user',
    'PETG, and make it sturdy — maybe 4mm walls.'
  );

-- ─────────────────────────────────────────────────────────────
-- Demo part spec
-- ─────────────────────────────────────────────────────────────
INSERT INTO public.part_specs (
  id, job_id, version, units, family, material,
  dimensions_json, load_requirements_json, constraints_json,
  assumptions_json, missing_fields_json, created_by
)
VALUES
  (
    '00000000-0000-0000-0000-000000000040',
    '00000000-0000-0000-0000-000000000030',
    1, 'mm', 'u_bracket', 'PETG',
    '{
      "pipe_od": 50.8,
      "wall_thickness": 4.0,
      "flange_width": 30.0,
      "flange_length": 60.0,
      "hole_diameter": 6.5,
      "hole_count": 2,
      "hole_spacing": 40.0,
      "fillet_radius": 3.0
    }',
    '{"estimated_static_load_lbs": 15, "shock_load": false}',
    '{"support_preference": "minimal", "fastener_standard": "M6"}',
    '["Pipe OD converted from 2 inches to 50.8mm", "Hole diameter oversized 0.5mm for FDM fit"]',
    '[]',
    'hybrid'
  )
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- Demo concept variants
-- ─────────────────────────────────────────────────────────────
INSERT INTO public.concept_variants (
  id, job_id, part_spec_id, variant_type, description, rationale, score_json
)
VALUES
  (
    '00000000-0000-0000-0000-000000000050',
    '00000000-0000-0000-0000-000000000030',
    '00000000-0000-0000-0000-000000000040',
    'requested',
    'Standard U-bracket with 4mm walls and M6 mounting holes',
    'Matches user specification exactly with standard FDM tolerances applied.',
    '{"printability": 0.91, "strength": 0.85, "material_efficiency": 0.78}'
  ),
  (
    '00000000-0000-0000-0000-000000000051',
    '00000000-0000-0000-0000-000000000030',
    '00000000-0000-0000-0000-000000000040',
    'stronger',
    'Reinforced U-bracket with 6mm walls and gussets',
    'Increased wall thickness and added internal gussets for higher load capacity.',
    '{"printability": 0.82, "strength": 0.95, "material_efficiency": 0.65}'
  ),
  (
    '00000000-0000-0000-0000-000000000052',
    '00000000-0000-0000-0000-000000000030',
    '00000000-0000-0000-0000-000000000040',
    'print_optimized',
    'Print-optimized U-bracket with chamfers instead of overhangs',
    'Replaced curved overhangs with chamfered edges to minimize support material.',
    '{"printability": 0.97, "strength": 0.80, "material_efficiency": 0.88}'
  );

-- ─────────────────────────────────────────────────────────────
-- Demo eval run
-- ─────────────────────────────────────────────────────────────
INSERT INTO public.eval_runs (suite_name, git_sha, provider, score, result_json)
VALUES
  (
    'spec-extraction',
    'abc1234',
    'gemini-2.0-flash',
    0.87,
    '{"passed": 87, "failed": 13, "total": 100}'
  );
