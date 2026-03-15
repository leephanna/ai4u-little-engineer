# Deployment Runbook

## Prerequisites

Before deploying, ensure you have:
- [ ] Supabase project created with schema applied
- [ ] OpenAI API key
- [ ] Vercel account and CLI installed
- [ ] Google Cloud project with Cloud Run enabled
- [ ] Trigger.dev account and project created
- [ ] GitHub repository with secrets configured

---

## 1. Supabase Setup

### Apply the schema

```bash
# Using the Supabase CLI
supabase db push --db-url postgresql://postgres:[password]@[host]:5432/postgres

# Or using psql directly
psql $DATABASE_URL < packages/db/schema.sql
psql $DATABASE_URL < packages/db/seed.sql
```

### Configure Storage

In the Supabase dashboard:
1. Create a bucket named `cad-artifacts`
2. Set bucket to **private** (access via signed URLs only)
3. Enable the following RLS policy on the bucket:

```sql
-- Allow users to read their own artifacts
CREATE POLICY "Users can read own artifacts"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'cad-artifacts' AND
  auth.uid()::text = (storage.foldername(name))[1]
);
```

### Configure Auth

In Supabase Auth settings:
1. Enable Email/Password authentication
2. Enable Magic Link authentication
3. Set Site URL to your Vercel deployment URL
4. Add redirect URLs: `https://your-app.vercel.app/auth/callback`

---

## 2. Web App → Vercel

### Initial deployment

```bash
cd apps/web

# Install Vercel CLI
npm i -g vercel

# Deploy (follow prompts)
vercel

# Set environment variables
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add SUPABASE_URL
vercel env add OPENAI_API_KEY
vercel env add CAD_WORKER_URL
vercel env add TRIGGER_SECRET_KEY
vercel env add WEBHOOK_SECRET
vercel env add SENTRY_DSN

# Deploy to production
vercel --prod
```

### GitHub Actions deployment

Set the following secrets in your GitHub repository:
- `VERCEL_TOKEN` — Vercel personal access token
- `VERCEL_ORG_ID` — From `vercel whoami`
- `VERCEL_PROJECT_ID` — From `.vercel/project.json`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## 3. CAD Worker → Google Cloud Run

### Build and push the Docker image

```bash
# Authenticate with Google Cloud
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# Configure Docker for GCR
gcloud auth configure-docker

# Build and push
docker build -t gcr.io/YOUR_PROJECT_ID/ai4u-cad-worker:latest apps/cad-worker/
docker push gcr.io/YOUR_PROJECT_ID/ai4u-cad-worker:latest
```

### Deploy to Cloud Run

```bash
gcloud run deploy ai4u-cad-worker \
  --image gcr.io/YOUR_PROJECT_ID/ai4u-cad-worker:latest \
  --region us-central1 \
  --platform managed \
  --memory 2Gi \
  --cpu 2 \
  --min-instances 0 \
  --max-instances 10 \
  --concurrency 4 \
  --timeout 300 \
  --no-allow-unauthenticated \
  --set-env-vars "ARTIFACTS_DIR=/app/artifacts,DEBUG=false" \
  --set-secrets "SUPABASE_URL=supabase-url:latest,SUPABASE_SERVICE_ROLE_KEY=supabase-service-role-key:latest"
```

### Set up Secret Manager

```bash
# Create secrets
echo -n "https://your-project.supabase.co" | \
  gcloud secrets create supabase-url --data-file=-

echo -n "your-service-role-key" | \
  gcloud secrets create supabase-service-role-key --data-file=-
```

### Get the Cloud Run URL

```bash
gcloud run services describe ai4u-cad-worker \
  --region us-central1 \
  --format 'value(status.url)'
```

Update `CAD_WORKER_URL` in Vercel with this URL.

---

## 4. Trigger.dev Tasks

### Set up the project

```bash
cd apps/trigger

# Install dependencies
pnpm install

# Log in to Trigger.dev
npx trigger.dev@latest login

# Initialize project (if not already done)
npx trigger.dev@latest init
```

### Configure environment variables in Trigger.dev

In the Trigger.dev dashboard, add these environment variables:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `CAD_WORKER_URL`
- `WEB_APP_WEBHOOK_URL` — `https://your-app.vercel.app/api/webhooks/cad-worker`
- `WEBHOOK_SECRET`
- `SENTRY_DSN` (optional)

### Deploy tasks

```bash
npx trigger.dev@latest deploy --env prod
```

---

## 5. Post-Deployment Verification

### Health checks

```bash
# CAD Worker health
curl https://your-cad-worker-url/health

# Web app
curl https://your-app.vercel.app/api/health
```

### End-to-end test

1. Sign up for a new account at `https://your-app.vercel.app`
2. Navigate to "New Job"
3. Record a voice message: "I need a 40mm spacer with a 6mm through-hole, 10mm tall"
4. Verify spec is extracted correctly
5. Click "Generate"
6. Wait for generation to complete (~30 seconds)
7. Verify STEP and STL files are available for download
8. Approve the job

---

## 6. Monitoring

### Sentry

Configure alerts for:
- Error rate > 1% on `/api/live-session`
- CAD worker failures > 5% of runs
- P95 latency > 30s on `/api/jobs/[id]/generate`

### Trigger.dev

Monitor task runs in the Trigger.dev dashboard:
- `cad-generation-pipeline` — Should complete in < 120s
- Failed runs trigger automatic retries (max 3)

### Supabase

Set up database alerts for:
- Connection pool utilization > 80%
- Storage usage > 80% of quota

---

## 7. Rollback Procedure

### Web App

```bash
# List recent deployments
vercel ls

# Roll back to previous deployment
vercel rollback [deployment-url]
```

### CAD Worker

```bash
# Roll back to previous Cloud Run revision
gcloud run services update-traffic ai4u-cad-worker \
  --region us-central1 \
  --to-revisions REVISION_NAME=100
```

### Database

Always create a backup before schema migrations:

```bash
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql
```

---

© AI4U, LLC. AI4Utech.com, Lee Hanna-Owner.
