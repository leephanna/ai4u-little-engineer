# AI4U Little Engineer — Staging Smoke Tests

Run these tests in order immediately after a staging deployment to verify system health.

## 1. CAD Worker Health

**Action:**
```bash
curl -s https://<your-cad-worker-url>/health
```

**Expected Result:**
```json
{
  "status": "ok",
  "version": "0.1.0",
  "engines": {
    "build123d": true,
    "freecad": false
  }
}
```

## 2. Web App Auth & Session

**Action:**
1. Navigate to `https://<your-vercel-domain>/signup`
2. Create a test account.
3. Navigate to `https://<your-vercel-domain>/jobs/new`

**Expected Result:**
- The page loads without errors.
- A new row appears in the `sessions` table in Supabase.

## 3. Voice Spec Extraction (LLM)

**Action:**
1. On the `/jobs/new` page, click the microphone button.
2. Say: "I need a spacer. Outer diameter 12 millimeters, inner diameter 6.5 millimeters, height 10 millimeters."
3. Wait for processing.

**Expected Result:**
- The UI transitions to the job detail page.
- The `jobs` table has a new row with `status = 'draft'`.
- The `part_specs` table has a new row with the extracted dimensions.

## 4. CAD Generation Pipeline (Trigger.dev)

**Action:**
1. On the job detail page, click "Generate CAD".
2. Select the "Requested" variant and click "Start Generation".
3. Monitor the Trigger.dev dashboard for the `cad-generation-pipeline` run.

**Expected Result:**
- The Trigger.dev run completes successfully.
- The `cad_runs` table has a new row with `status = 'success'`.
- The `artifacts` table has at least two new rows (STEP and STL).
- The `jobs` table status updates to `awaiting_approval`.

## 5. Artifact Storage Integrity

**Action:**
1. Go to the Supabase Storage dashboard.
2. Open the `cad-artifacts` bucket.

**Expected Result:**
- You should see a folder structure like `<job_id>/<cad_run_id>/`.
- Inside, there should be a `.step` file, an `.stl` file, and a `receipt.json` file.

## 6. Webhook Notification

**Action:**
1. Check the Vercel logs for the web app.

**Expected Result:**
- You should see a log entry from `POST /api/webhooks/cad-worker` indicating a successful notification.
- The UI on the job detail page should automatically update to show the download buttons and approval panel.
