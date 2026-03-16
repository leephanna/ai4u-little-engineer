# AI4U Little Engineer

> Voice-first, AI-powered 3D-printable part design assistant for machinists and makers.

[![Web CI](https://github.com/ai4u/little-engineer/actions/workflows/web-ci.yml/badge.svg)](https://github.com/ai4u/little-engineer/actions/workflows/web-ci.yml)
[![CAD Worker CI](https://github.com/ai4u/little-engineer/actions/workflows/cad-worker-ci.yml/badge.svg)](https://github.com/ai4u/little-engineer/actions/workflows/cad-worker-ci.yml)

---

## Overview

AI4U Little Engineer is a production-grade MVP that lets machinists describe a part they need in plain English (via voice), and automatically generates a validated, print-ready CAD model (STEP + STL). The workflow is:

1. **Voice Input** → User describes the part (e.g. "I need a 40mm spacer with M6 through-hole")
2. **AI Extraction** → Gemini 2.0 Flash (via Live API) or GPT-4.1 extracts a structured `PartSpec` and asks clarifying questions. *Note: V1 uses Whisper transcription before Gemini reasoning.*
3. **CAD Generation** → `build123d` Python library generates parametric geometry. *Note: FreeCAD is stubbed/disabled in V1.*
4. **Validation** → Automated printability checks (wall thickness, bounding box, units)
5. **Review & Approve** → User reviews the STEP/STL and approves for printing
6. **Print Feedback** → Outcome recorded for continuous improvement

---

## Monorepo Structure

```
ai4u-little-engineer/
├── apps/
│   ├── web/              # Next.js 15 PWA (TypeScript, Tailwind, Supabase Auth)
│   ├── cad-worker/       # FastAPI + build123d CAD generation service (Python 3.11)
│   └── trigger/          # Trigger.dev v3 background tasks (TypeScript)
├── packages/
│   ├── shared/           # Shared TypeScript types, schemas, and prompts
│   └── db/               # Supabase SQL schema and seed data
├── .github/
│   └── workflows/        # CI/CD pipelines (GitHub Actions)
├── .env.example          # Environment variable template
└── turbo.json            # Turborepo task orchestration
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS |
| Auth & DB | Supabase (PostgreSQL + Auth + Storage) |
| Voice AI | Gemini 2.0 Flash (primary) or OpenAI GPT-4.1 (fallback) + Whisper STT |
| CAD Engine | Python 3.11 + build123d (FreeCAD is stubbed in V1) |
| API Service | FastAPI + Pydantic v2 |
| Background Jobs | Trigger.dev v3 |
| Deployment | Vercel (web) + Google Cloud Run (CAD worker) |
| Observability | Sentry |
| CI/CD | GitHub Actions |

---

## Quick Start

### Prerequisites

- Node.js 22+, pnpm 9+
- Python 3.11+
- Docker (for CAD worker)
- Supabase project
- OpenAI API key

### 1. Clone and install

```bash
git clone https://github.com/ai4u/little-engineer.git
cd ai4u-little-engineer
pnpm install
```

### 2. Configure environment

```bash
cp .env.example apps/web/.env.local
# Edit apps/web/.env.local with your Supabase and OpenAI credentials
```

### 3. Set up the database

```bash
# Apply the schema to your Supabase project
psql $DATABASE_URL < packages/db/schema.sql
psql $DATABASE_URL < packages/db/seed.sql
```

### 4. Start the web app

```bash
pnpm --filter @ai4u/web dev
# → http://localhost:3000
```

### 5. Start the CAD worker (Docker)

```bash
cd apps/cad-worker
docker build -t ai4u-cad-worker .
docker run -p 8080:8080 \
  -e SUPABASE_URL=$SUPABASE_URL \
  -e SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY \
  ai4u-cad-worker
# → http://localhost:8080
```

### 6. Start Trigger.dev (local dev)

```bash
cd apps/trigger
pnpm dev
```

---

## Part Families

The following parametric part families are supported in V1:

| Family | Key Dimensions |
|---|---|
| `spacer` | outer_diameter, inner_diameter, height |
| `flat_bracket` | length, width, thickness, hole patterns |
| `l_bracket` | arm1_length, arm2_length, width, thickness |
| `u_bracket` | inner_width, inner_height, wall_thickness, depth |
| `hole_plate` | length, width, thickness, hole grid |
| `standoff_block` | base_length, base_width, height, hole_diameter |
| `cable_clip` | cable_diameter, clip_width, base_width |
| `enclosure` | inner_length, inner_width, inner_height, wall_thickness |
| `adapter_bushing` | outer_diameter, inner_diameter, length |
| `simple_jig` | base_length, base_width, height |

---

## API Reference

### CAD Worker

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Health check |
| `/generate` | POST | Generate CAD model from PartSpec |
| `/validate` | POST | Validate a PartSpec without generating |
| `/export/{format}` | POST | Export existing geometry to STEP/STL |

### Web App API Routes

| Route | Method | Description |
|---|---|---|
| `/api/live-session` | POST | Process voice audio, extract spec |
| `/api/jobs/[id]/generate` | POST | Trigger CAD generation |
| `/api/jobs/[id]/approve` | POST | Submit approval decision |
| `/api/jobs/[id]/print-result` | POST | Record print outcome |
| `/api/artifacts/[id]/download` | GET | Download artifact (signed URL) |
| `/api/webhooks/cad-worker` | POST | Receive CAD worker results |

---

## Environment Variables

See [`.env.example`](.env.example) for the complete list of required and optional environment variables.

---

## Deployment

### Web App → Vercel

```bash
cd apps/web
npx vercel --prod
```

Set the following environment variables in Vercel:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `CAD_WORKER_URL`
- `TRIGGER_SECRET_KEY`
- `WEBHOOK_SECRET`

### CAD Worker → Google Cloud Run

```bash
gcloud run deploy ai4u-cad-worker \
  --image ghcr.io/ai4u/little-engineer/cad-worker:latest \
  --region us-central1 \
  --memory 2Gi \
  --cpu 2 \
  --min-instances 0 \
  --max-instances 10 \
  --concurrency 4 \
  --timeout 300
```

### Trigger.dev Tasks

```bash
cd apps/trigger
npx trigger.dev@latest deploy --env prod
```

---

## Development

### Running all checks

```bash
pnpm turbo typecheck lint
```

### Running tests

```bash
# Web app
pnpm --filter @ai4u/web test

# CAD worker
cd apps/cad-worker && python -m pytest tests/ -v
```

---

## Architecture

```
Browser (PWA)
    │
    ▼
Next.js App (Vercel)
    │  ├── /api/live-session  ──► Gemini 2.0 Flash (or Whisper + GPT-4.1 fallback)
    │  ├── /api/jobs/[id]/generate ──► Trigger.dev
    │  └── /api/webhooks/cad-worker ◄── CAD Worker callback
    │
    ▼
Supabase
    ├── PostgreSQL (jobs, specs, runs, artifacts)
    ├── Auth (email/password + magic link)
    └── Storage (STEP, STL, PNG artifacts)
    
Trigger.dev (Background Jobs)
    ├── cad-generation-pipeline
    ├── spec-extraction
    └── concept-variants
         │
         ▼
    CAD Worker (Cloud Run)
         ├── build123d generators
         ├── Geometry validators
         └── STEP/STL exporters
```

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make changes and ensure all CI checks pass
4. Submit a pull request

---

## License

Copyright © AI4U, LLC. AI4Utech.com, Lee Hanna-Owner. All rights reserved.
