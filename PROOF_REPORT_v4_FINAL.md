# AI4U Little Engineer — Final Live Proof Report

**Date:** 2026-04-19  
**Commits:**
- Web / Vercel: `90a920f` (primitive normalizer, solid_block web layer, gallery locked specs, probe endpoint)
- CAD Worker / Render: `8f7b2ec` (solid_block in SUPPORTED_FAMILIES — the final schema fix)

---

## Summary

All 4 last-mile issues are fully resolved and proven live across all three user journeys. Every receipt below is a real HTTP response from the live production system with a real job ID, real DB row, and real CAD run.

---

## Probe Receipt — `/api/probe` (commit `90a920f`, live)

```
GET https://ai4u-little-engineer-web.vercel.app/api/probe
X-Admin-Bypass-Key: [redacted]

HTTP 200
commit_sha: 90a920fbd515c07422965a4cb70f64346ed8027a
all_tests_pass: true

Tests:
  ✅ cube_journey_a:     family=solid_block,    params={length:5, width:5, height:5}
  ✅ cube_5mm:           family=solid_block,    params={length:5, width:5, height:5}
  ✅ solid_cube_20mm:    family=solid_block,    params={length:20, width:20, height:20}
  ✅ cylinder:           family=spacer,         params={outer_diameter:20, inner_diameter:0, length:30}
  ✅ standoff_explicit:  family=standoff_block, params={base_width:20, height:3, hole_diameter:3}
  ✅ ring:               family=spacer,         params={outer_diameter:30, inner_diameter:10, length:5}
  ✅ no_match_bracket:   family=null            (no false positive)
```

---

## Journey A — Cube → `solid_block` (end-to-end)

**Input:** `"Make a cube with 5mm sides. Don't ask for clarification. Just make a cube."`

```
POST https://ai4u-little-engineer-web.vercel.app/api/invent
X-Admin-Bypass-Key: [redacted]

HTTP 200
{
  "job_id":        "3d20fdef-8e50-4fe4-a070-5744a3bf738f",
  "cad_run_id":    "9c80fb72-7eb6-45ff-8402-02f312e0b942",
  "trigger_run_id":"run_cmo68sm827zsc0nmwgczw3e59",
  "family":        "solid_block",
  "parameters":    {"length": 5, "width": 5, "height": 5},
  "reasoning":     "Cube primitive detected. Mapped to solid_block (true solid, no hole) with equal sides: 5mm × 5mm × 5mm.",
  "confidence":    0.97
}
```

**DB Receipt — `jobs` table:**
```json
{
  "id":               "3d20fdef-8e50-4fe4-a070-5744a3bf738f",
  "status":           "awaiting_approval",
  "requested_family": "solid_block",
  "title":            "Invention: Make a cube with 5mm sides...",
  "created_at":       "2026-04-19T20:52:34.591051+00:00"
}
```

**DB Receipt — `cad_runs` table:**
```json
{
  "id":                    "9c80fb72-7eb6-45ff-8402-02f312e0b942",
  "status":                "success",
  "generator_name":        "solid_block",
  "error_text":            null,
  "normalized_params_json": {
    "length_mm":    5,
    "width_mm":     5,
    "height_mm":    5,
    "chamfer_mm":   0,
    "variant_type": "requested"
  },
  "started_at": "2026-04-19T20:52:38.59+00:00",
  "ended_at":   "2026-04-19T20:52:40.079+00:00"
}
```

**Verdict: ✅ PASS** — family=`solid_block`, cad_run=`success`, 1.5s generation time.

---

## Journey B — Gallery Locked Preset (spacer, 20mm OD)

**Input:** `intake_family_candidate=spacer, intake_dimensions={outer_diameter:20, inner_diameter:5, length:15}, locked_spec=true`

```
POST https://ai4u-little-engineer-web.vercel.app/api/invent
X-Admin-Bypass-Key: [redacted]

HTTP 200
{
  "job_id":  "1964e4e9-0d91-48db-a10c-3149f9ddcecf",
  "family":  "spacer"
}
```

**DB Receipt — `jobs` table:**
```json
{
  "id":               "1964e4e9-0d91-48db-a10c-3149f9ddcecf",
  "status":           "awaiting_approval",
  "requested_family": "spacer",
  "created_at":       "2026-04-19T20:19:09.627651+00:00"
}
```

**DB Receipt — `cad_runs` table:**
```json
{
  "id":             "860f8323-9e5d-4bb7-9dcd-d4c573c4eda0",
  "status":         "success",
  "generator_name": "spacer",
  "normalized_params_json": {
    "outer_diameter_mm": 20,
    "inner_diameter_mm": 5,
    "height_mm":         15,
    "is_hollow":         true,
    "wall_thickness_mm": 7.5
  }
}
```

**Verdict: ✅ PASS** — locked spec bypassed LLM, family=`spacer`, cad_run=`success`.

---

## Journey C — Artemis Demo

**Input:** `POST /api/demo/artemis` (locked spec: spacer OD=50mm, L=200mm, solid cylinder)

```
POST https://ai4u-little-engineer-web.vercel.app/api/demo/artemis
X-Admin-Bypass-Key: [redacted]

HTTP 200
{
  "job_id":        "88b5e2f1-fa5b-495b-ae4c-5eefe2b8682f",
  "cad_run_id":    "071f6493-37d9-46cc-a139-51184a6d122b",
  "trigger_run_id":"run_cmo67lvdp7lzx0hmwxb6l2y52",
  "family":        "spacer",
  "parameters":    {"outer_diameter": 50, "length": 200, "inner_diameter": 0},
  "label":         "Medium Artemis II Rocket Body (20cm)"
}
```

**DB Receipt — `jobs` table:**
```json
{
  "id":               "88b5e2f1-fa5b-495b-ae4c-5eefe2b8682f",
  "status":           "awaiting_approval",
  "requested_family": "spacer",
  "title":            "Artemis II Rocket — Medium Artemis II Rocket Body (20cm)",
  "created_at":       "2026-04-19T20:19:20.772292+00:00"
}
```

**DB Receipt — `cad_runs` table:**
```json
{
  "id":             "071f6493-37d9-46cc-a139-51184a6d122b",
  "status":         "success",
  "generator_name": "spacer",
  "normalized_params_json": {
    "outer_diameter_mm": 50,
    "inner_diameter_mm": 0,
    "height_mm":         200,
    "is_hollow":         false,
    "wall_thickness_mm": 25
  },
  "started_at": "2026-04-19T20:19:21.741+00:00",
  "ended_at":   "2026-04-19T20:19:23.101+00:00"
}
```

**Verdict: ✅ PASS** — family=`spacer`, cad_run=`success`, 1.4s generation time.

---

## What Was Fixed (Complete Audit Trail)

| Layer | File | Change | Commit |
|-------|------|--------|--------|
| Web — normalizer | `apps/web/lib/primitive-normalizer.ts` | cube/block → `solid_block` (no hole); cylinder → `spacer`; standoff → `standoff_block` with `base_width` | `90a920f` |
| Web — interpret route | `apps/web/app/api/intake/interpret/route.ts` | Normalizer fires before LLM; admin bypass for probing; proof instrumentation headers | `90a920f` |
| Web — invent route | `apps/web/app/api/invent/route.ts` | Admin bypass; normalizer in fast-path | `90a920f` |
| Web — gallery | `apps/web/app/gallery/page.tsx` | 10 items with locked `?spec=<base64>` payloads; no LLM re-interpretation | `90a920f` |
| Web — probe endpoint | `apps/web/app/api/probe/route.ts` | New `/api/probe` endpoint with 7 normalizer test cases | `90a920f` |
| Web — job detail | `apps/web/app/jobs/[id]/page.tsx` | Exactly 5 honest truth states; no deceptive affordances | `90a920f` |
| Shared — part-families | `packages/shared/src/part-families.ts` | `solid_block` added to `MVP_PART_FAMILIES` | `90a920f` |
| Shared — capability registry | `packages/shared/src/capability-registry.ts` | `solid_block` entry added; `standoff_block` schema corrected to `base_width/height/hole_diameter` | `90a920f` |
| CAD Worker — generator | `apps/cad-worker/app/generators/solid_block.py` | New `solid_block` generator (build123d, true solid rectangular prism) | `90a920f` |
| CAD Worker — registry | `apps/cad-worker/app/generators/__init__.py` | `solid_block` imported and registered | `90a920f` |
| CAD Worker — schema | `apps/cad-worker/app/schemas/part_spec.py` | `solid_block` added to `SUPPORTED_FAMILIES` Pydantic validator | `8f7b2ec` |

---

## Root Causes Found and Fixed

1. **Cube mis-routing** — LLM was routing "cube" to `spacer` or `simple_jig`. Fixed by primitive normalizer that fires before LLM.
2. **`standoff_block` schema mismatch** — shared registry used `length/width/height/hole_diameter` but CAD worker expected `base_width/height/hole_diameter` (min 1.5mm hole). Fixed by aligning both layers.
3. **`solid_block` missing entirely** — no true solid block family existed. Created across all 4 layers (generator, registry, schema, shared package).
4. **Pydantic validator hardcoded** — `part_spec.py` had a hardcoded `SUPPORTED_FAMILIES` list that rejected `solid_block` at request parse time, before the generator registry was consulted. Fixed in `8f7b2ec`.
5. **Gallery LLM re-interpretation** — gallery "Make This" buttons were sending freeform prompts to LLM. Fixed with locked `?spec=<base64>` payloads.
6. **Job detail deceptive truth states** — fixed with `deriveTruthState()` returning exactly 5 honest states.

---

## Overall Verdict

| Check | Result |
|-------|--------|
| Probe: 7/7 normalizer tests | ✅ PASS |
| Journey A: cube → solid_block → cad_run=success | ✅ PASS |
| Journey B: gallery locked preset → spacer → cad_run=success | ✅ PASS |
| Journey C: Artemis demo → spacer → cad_run=success | ✅ PASS |
| **OVERALL** | **✅ ALL PASS** |
