# Render Deployment Guide — CAD Worker

## Overview
The CAD worker is a FastAPI microservice that runs in Docker. It exposes `POST /generate` to the Trigger.dev pipeline and `GET /health` for Render's health check. This document provides exact steps to deploy it on Render.

## Prerequisites
- A Render account at [dashboard.render.com](https://dashboard.render.com) with a payment method on file (required even for free-tier Docker services).
- The `render.yaml` file is already committed to the root of the repository. Render will auto-detect it.
- The GitHub repository `leephanna/ai4u-little-engineer` must be connected to your Render account.

## Step 1: Connect GitHub to Render
1. Go to [dashboard.render.com](https://dashboard.render.com).
2. Click **New +** → **Blueprint** (this uses the `render.yaml`).
3. Connect your GitHub account if not already connected.
4. Select the `leephanna/ai4u-little-engineer` repository.
5. Render will detect `render.yaml` and propose creating the `ai4u-cad-worker` service.
6. Click **Apply**.

## Step 2: Set Environment Variables
After the service is created, navigate to the service's **Environment** tab and add the following secrets:

| Variable | Value | Notes |
|---|---|---|
| `SUPABASE_URL` | `https://your-project.supabase.co` | From Supabase project settings |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` | Service role key (bypasses RLS) |
| `ALLOWED_ORIGINS` | `https://ai4u-little-engineer-web.vercel.app` | Your Vercel app URL |
| `SENTRY_DSN` | `https://...@sentry.io/...` | Optional, for error tracking |

The following are already set via `render.yaml` and do not need to be added manually:
- `PYTHONUNBUFFERED=1`
- `PYTHONPATH=/app`
- `ARTIFACTS_DIR=/app/artifacts`
- `DEBUG=false`

## Step 3: Verify the Deployment
Once the Docker build completes (approximately 10–15 minutes for the first build due to `build123d` compilation), verify the service is healthy:

```bash
curl https://ai4u-cad-worker.onrender.com/health
# Expected: {"status": "ok", "build123d_available": true}
```

## Step 4: Copy the Service URL
After deployment, copy the service URL from the Render dashboard (e.g., `https://ai4u-cad-worker.onrender.com`). This is the `CAD_WORKER_URL` that must be set in:
1. The Trigger.dev cloud environment (see `TRIGGER_WIRING.md`).
2. The Vercel environment variables (as `CAD_WORKER_URL`).

## Docker Build Notes
The Dockerfile uses `python:3.11-slim` as the base image. The `build123d==0.7.0` package requires Open CASCADE Technology (OCC) system libraries, which are installed via `apt-get` in the Dockerfile. The build takes approximately 10–15 minutes on first run. Subsequent builds use Docker layer caching and are significantly faster.

**Important:** The `requirements.txt` currently lists `httpx==0.27.0` twice. This is harmless but should be cleaned up. The duplicate is on line 12.

## Render Plan Recommendation
The `render.yaml` specifies the `standard` plan ($25/month). The free tier is not recommended for the CAD worker because:
1. Free tier services spin down after 15 minutes of inactivity, causing cold starts of 30–60 seconds.
2. `build123d` CAD generation can take 30–90 seconds, and Trigger.dev has a 120-second timeout for the worker call.
3. The standard plan provides 2 vCPUs and 4 GB RAM, which is adequate for concurrent generation requests.

## Auto-Deploy on Push
The `render.yaml` is configured to auto-deploy when changes are pushed to the `master` branch in the `apps/cad-worker/` directory. No additional configuration is needed.

## Troubleshooting
- **Build fails with OCC library errors:** Ensure the `apt-get` step in the Dockerfile is not being skipped. Check the Render build logs.
- **Health check fails:** Verify the service is listening on port `8080`. The `CMD` in the Dockerfile is `uvicorn app.main:app --host 0.0.0.0 --port 8080`.
- **`build123d` not available:** The startup log should show `build123d loaded successfully`. If it shows a warning, the pip install step failed silently. Check the build logs for pip errors.
