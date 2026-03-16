# Architecture Deep Dive

## System Overview

AI4U Little Engineer is a voice-first, AI-powered 3D-printable part design assistant. The system is designed as a production-grade MVP with clear separation of concerns across three main services.

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         User (Mobile PWA)                        │
└──────────────────────────────┬──────────────────────────────────┘
                               │ Voice audio (WebM/Opus)
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Next.js Web App (Vercel)                      │
│                                                                  │
│  POST /api/live-session                                          │
│    1. Whisper STT → transcript                                   │
│    2. GPT-4.1 → PartSpec extraction + clarifying questions       │
│    3. Save voice_turns + part_specs to Supabase                  │
│    4. Return response_text + spec status                         │
│                                                                  │
│  POST /api/jobs/[id]/generate                                    │
│    1. Create cad_runs record (queued)                            │
│    2. Trigger Trigger.dev task                                   │
│    3. Return cad_run_id                                          │
└──────────────────────────────┬──────────────────────────────────┘
                               │ Task payload
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Trigger.dev (Background Jobs)                  │
│                                                                  │
│  cad-generation-pipeline                                         │
│    1. Fetch PartSpec from Supabase                               │
│    2. POST /generate to CAD Worker                               │
│    3. Upload artifacts to Supabase Storage                       │
│    4. Write receipt.json                                         │
│    5. Update cad_runs + jobs tables                              │
│    6. POST /api/webhooks/cad-worker (notify web app)             │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTP POST /generate
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                   CAD Worker (Cloud Run)                         │
│                                                                  │
│  POST /generate                                                  │
│    1. Validate PartSpec dimensions                               │
│    2. Dispatch to family generator (build123d)                   │
│    3. Run printability validation                                │
│    4. Export STEP + STL                                          │
│    5. Return artifacts + validation report                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### Core Tables

**`jobs`** — The top-level entity representing a user's part request.

| Column | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `user_id` | UUID | FK to auth.users |
| `session_id` | TEXT | Voice session identifier |
| `title` | TEXT | Auto-generated from first utterance |
| `status` | ENUM | draft → clarifying → generating → awaiting_approval → approved/rejected → printed |
| `requested_family` | TEXT | What the user asked for |
| `selected_family` | TEXT | What was actually generated |
| `confidence_score` | FLOAT | AI extraction confidence (0–1) |
| `latest_spec_version` | INT | Current spec version number |
| `latest_run_id` | UUID | FK to most recent cad_run |

**`part_specs`** — Versioned structured part specifications.

| Column | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `job_id` | UUID | FK to jobs |
| `version` | INT | Spec version (increments on each revision) |
| `family` | TEXT | Part family identifier |
| `units` | TEXT | "mm" or "in" |
| `dimensions_json` | JSONB | Key-value dimension map |
| `assumptions_json` | JSONB | List of AI-applied assumptions |
| `missing_fields_json` | JSONB | List of fields still needed |

**`cad_runs`** — Individual CAD generation attempts.

| Column | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `job_id` | UUID | FK to jobs |
| `part_spec_id` | UUID | FK to part_specs |
| `engine` | TEXT | "build123d" or "freecad" |
| `status` | TEXT | queued → running → success/failed |
| `validation_report_json` | JSONB | Printability check results |
| `error_text` | TEXT | Error message if failed |

**`artifacts`** — Generated files stored in Supabase Storage.

| Column | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `cad_run_id` | UUID | FK to cad_runs |
| `job_id` | UUID | FK to jobs |
| `kind` | TEXT | "step", "stl", "png", "json_receipt" |
| `storage_path` | TEXT | Path in "cad-artifacts" bucket |
| `mime_type` | TEXT | MIME type |
| `file_size_bytes` | BIGINT | File size |

**`approvals`** — Human review decisions.

| Column | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `job_id` | UUID | FK to jobs |
| `cad_run_id` | UUID | FK to cad_runs |
| `reviewer_user_id` | UUID | FK to auth.users |
| `decision` | TEXT | "approved", "rejected", "revision_requested" |
| `notes` | TEXT | Optional reviewer notes |

**`print_results`** — Post-print outcome feedback.

| Column | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `job_id` | UUID | FK to jobs |
| `outcome` | TEXT | "success", "partial", "fail" |
| `fit_score` | INT | 1–5 |
| `strength_score` | INT | 1–5 |
| `surface_score` | INT | 1–5 |
| `issue_tags` | TEXT[] | Array of issue identifiers |

---

## CAD Worker Architecture

The CAD worker is a stateless FastAPI service that accepts a `PartSpec` and returns CAD artifacts.

### Generator Pattern (V1 Engine)

In V1, **build123d** is the only supported production CAD engine. The FreeCAD engine is stubbed and disabled by default.

Each part family has a dedicated generator module following this interface:

```python
def generate(spec: PartSpec) -> Shape:
    """Generate geometry from spec. Raises DimensionValidationError on invalid input."""
    ...

def get_schema() -> dict:
    """Return JSON schema for this generator's parameters."""
    ...
```

Generators are registered in `app/generators/__init__.py` and dispatched by family name.

### Validation Pipeline

1. **Dimension validation** — Required fields present, values in valid ranges
2. **Geometry generation** — build123d constructs the solid
3. **Printability checks** — Wall thickness, bounding box, overhangs
4. **Export** — STEP (for CAD tools) + STL (for slicers)

### Printability Score

The printability score (0.0–1.0) is computed from:
- Wall thickness ≥ 1.2mm (for 0.4mm nozzle): +0.3
- No extreme overhangs (>60°): +0.25
- Bounding box fits in 220×220×250mm: +0.25
- No thin features (<0.8mm): +0.2

---

## Voice UI Architecture

The voice session uses a push-to-talk model:

1. User presses and holds the microphone button
2. Browser records audio using `MediaRecorder` API (WebM/Opus)
3. On release, audio blob is base64-encoded and sent to `/api/live-session`
4. Server transcribes with Whisper (used for both OpenAI and Gemini paths in V1, as true WebSocket streaming is planned for V2)
5. Server extracts spec using either GPT-4.1 (JSON mode) or Gemini Live (function-calling), depending on `LLM_PROVIDER`
6. Response text is spoken via browser `SpeechSynthesis` API
7. Conversation continues until spec is complete

### State Machine

```
idle → recording → processing → responding → idle
                                    │
                                    ▼
                              spec_complete → redirect to generate page
```

---

## Security

- **Row Level Security (RLS)** — All Supabase tables have RLS policies ensuring users can only access their own data
- **Service role key** — Used only in server-side API routes and Trigger.dev tasks, never exposed to the client
- **Webhook secret** — Shared secret between Trigger.dev/CAD worker and the web app webhook endpoint
- **Signed URLs** — Artifact downloads use short-lived (60s) signed URLs from Supabase Storage
- **Microphone permission** — Requested only when user initiates a voice session

---

## Scaling Considerations

- **CAD Worker** — Stateless, horizontally scalable on Cloud Run (min 0, max 10 instances)
- **Trigger.dev** — Managed queue with automatic concurrency control
- **Supabase** — PostgreSQL with connection pooling via PgBouncer
- **Next.js** — Serverless functions on Vercel Edge Network

---

© AI4U, LLC. AI4Utech.com, Lee Hanna-Owner.
