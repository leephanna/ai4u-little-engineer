# AI4U Little Engineer — Environment Variable Matrix

This document details every required environment variable, where it must be set, and its purpose.

## 1. Web App (Vercel)

Set these in the Vercel project settings.

| Variable | Example / Placeholder | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xyz.supabase.co` | Client-side Supabase connection |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGci...` | Client-side Supabase auth |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGci...` | Server-side admin DB access |
| `LLM_PROVIDER` | `openai` or `gemini` | Selects the voice/reasoning engine |
| `LLM_MODEL` | `gpt-4.1-mini` | Model to use if provider is openai |
| `OPENAI_API_KEY` | `sk-...` | Required for Whisper STT (and GPT if selected) |
| `GEMINI_API_KEY` | `AIza...` | Required if LLM_PROVIDER=gemini |
| `TRIGGER_SECRET_KEY` | `tr_...` | Auth for triggering background tasks |
| `TRIGGER_PROJECT_ID` | `ai4u-little-engineer` | Identifies the Trigger.dev project |
| `TRIGGER_API_URL` | `https://api.trigger.dev` | Trigger.dev API endpoint |
| `WEBHOOK_SECRET` | `super-secret-string-32-chars` | Validates incoming webhooks from Trigger |

## 2. Trigger.dev (Cloud Dashboard)

Set these in the Trigger.dev dashboard for the specific environment (staging/prod).

| Variable | Example / Placeholder | Purpose |
|---|---|---|
| `SUPABASE_URL` | `https://xyz.supabase.co` | DB connection for pipeline state updates |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGci...` | Admin DB access for pipeline |
| `CAD_WORKER_URL` | `https://cad-worker-xyz.a.run.app` | URL of the deployed Cloud Run service |
| `WEB_APP_WEBHOOK_URL` | `https://app.vercel.app/api/webhooks/cad-worker` | Where to send completion notifications |
| `WEBHOOK_SECRET` | `super-secret-string-32-chars` | Must match the Vercel WEBHOOK_SECRET |

## 3. CAD Worker (Google Cloud Run)

Set these during the `gcloud run deploy` command or in the Cloud Run console.

| Variable | Example / Placeholder | Purpose |
|---|---|---|
| `SUPABASE_URL` | `https://xyz.supabase.co` | Required to upload artifacts to storage |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGci...` | Required to upload artifacts to storage |
| `ALLOWED_ORIGINS` | `https://app.vercel.app` | CORS configuration |
| `ARTIFACTS_DIR` | `/app/artifacts` | Local scratch space inside container |
| `ENABLE_FREECAD_ADAPTER` | `false` | Keep false for v1 (FreeCAD is stubbed) |
| `DEBUG` | `false` | Enable verbose logging if true |
