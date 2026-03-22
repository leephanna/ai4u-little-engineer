# AI4U Little Engineer — Staging Deployment Guide

This document provides the exact step-by-step instructions to reproduce the staging deployment from scratch.

## Service Map

The v1 stack consists of four distinct services:

1. **Supabase** — PostgreSQL database, Auth, and Storage (`cad-artifacts` bucket).
2. **CAD Worker** — Python/FastAPI service running `build123d`. Deployed to Google Cloud Run.
3. **Trigger.dev** — Background task orchestrator for the CAD generation pipeline.
4. **Web App** — Next.js 14 frontend and API routes. Deployed to Vercel.

## Deployment Order

You must deploy in this exact order to satisfy dependencies:

### 1. Supabase (Database & Storage)

1. Create a new Supabase project.
2. Go to SQL Editor and run the contents of `packages/db/schema.sql`.
3. Go to Storage and create a new bucket named `cad-artifacts`.
   - Make it a **public** bucket (or configure signed URLs if required by your security posture).
4. Go to Authentication -> URL Configuration and add your eventual Vercel domain to the Site URL and Redirect URLs.
5. Note your `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.

### 2. CAD Worker (Google Cloud Run)

1. Ensure you have the Google Cloud SDK installed and authenticated.
2. Build and push the Docker image:
   ```bash
   cd apps/cad-worker
   gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/cad-worker
   ```
3. Deploy to Cloud Run:
   ```bash
   gcloud run deploy cad-worker \
     --image gcr.io/YOUR_PROJECT_ID/cad-worker \
     --platform managed \
     --region us-central1 \
     --allow-unauthenticated \
     --memory 2Gi \
     --set-env-vars SUPABASE_URL="<your-supabase-url>",SUPABASE_SERVICE_ROLE_KEY="<your-service-role-key>",ALLOWED_ORIGINS="<your-vercel-domain>"
   ```
4. Note the resulting Cloud Run URL (this is your `CAD_WORKER_URL`).

### 3. Trigger.dev (Background Tasks)

1. Create a project in Trigger.dev cloud.
2. Note your `TRIGGER_PROJECT_ID` and `TRIGGER_SECRET_KEY`.
3. Set the required environment variables in the Trigger.dev dashboard for your staging environment:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `CAD_WORKER_URL`
   - `WEB_APP_WEBHOOK_URL` (e.g., `https://your-app.vercel.app/api/webhooks/cad-worker`)
   - `WEBHOOK_SECRET` (generate a random 32+ char string)
4. Deploy the tasks:
   ```bash
   cd apps/trigger
   npx trigger.dev@latest deploy --env staging
   ```

### 4. Web App (Vercel)

1. Push your repository to GitHub.
2. Import the project into Vercel.
3. Set the Root Directory to `apps/web`.
4. Configure all required environment variables (see `ENV_MATRIX.md`).
5. Deploy.

## Post-Deployment Wiring

After all services are up, ensure the webhook secret is synchronized:
- The `WEBHOOK_SECRET` in Vercel must exactly match the `WEBHOOK_SECRET` in Trigger.dev.
- The `WEB_APP_WEBHOOK_URL` in Trigger.dev must point to the correct Vercel domain.
