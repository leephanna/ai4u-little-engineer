# Reality Matrix & Core Flow Convergence

## 1. Reality Matrix (Audit Results)

| Feature / Flow | Status | Evidence from Code |
|---|---|---|
| **Homepage CTA ("Start Creating Free")** | 🟡 Deceptive | Routes to `/signup`, but there is no onboarding flow. After signup, the user lands on `/dashboard` which has no clear "Create" button. |
| **Dual Lane Section (Shop vs Fun)** | 🟡 Deceptive | Both lanes route to `/invent` or `/gallery`. The "Shop" lane implies precision tools that do not exist. |
| **Gallery ("Make This")** | 🟢 Working | Routes to `/invent?q=[prompt]`. The prompt is pre-filled and the Universal Creator Flow handles it correctly. |
| **Artemis II Demo** | 🟢 Working | Routes to `/demo/artemis`. Generates a rocket body using the `spacer` family. |
| **Universal Creator Flow (`/invent`)** | 🟢 Working | The core intake engine. Handles text, images, and documents. Correctly interprets and routes to `/api/invent`. |
| **Job Detail Page (Preview)** | 🟢 Working | `JobPreviewPanel` correctly renders the STL artifact inline. |
| **Job Detail Page (Approval)** | 🔴 Broken | `ApprovalPanel` calls `POST /api/jobs/[id]/approve`, but this route **does not exist**. |
| **Job Detail Page (Revision)** | 🔴 Broken | `RevisionPanel` calls `POST /api/jobs/[id]/revise`, but this route **does not exist**. |
| **Job Detail Page (Feedback)** | 🔴 Broken | `FeedbackUploadWidget` calls `POST /api/feedback/upload`, but this route **does not exist**. |
| **Job Detail Page (Patent Summary)** | 🔴 Broken | `InventionProtectionPanel` calls `POST /api/jobs/[id]/patent-summary`, but this route **does not exist**. |
| **Job Detail Page (Tags)** | 🔴 Broken | `TagEditor` calls `PUT /api/jobs/[id]/tags`, but the route only implements `PUT` and fails if the job is not found. |
| **Job Detail Page (Print Result)** | 🔴 Broken | `POST /api/jobs/[id]/print-result` route exists but is incomplete and fails. |
| **Job Detail Page (Share)** | 🟢 Working | `SharePanel` correctly calls `POST /api/jobs/[id]/share` and generates a token. |
| **Marketplace (`/marketplace`)** | 🟡 Deceptive | Page exists but is a static placeholder. No actual marketplace functionality. |
| **Pricing (`/pricing`)** | 🟡 Deceptive | Page exists but is a static placeholder. No actual billing integration. |

## 2. Root Cause Summary

The application suffers from **Deceptive Affordance Syndrome**. The UI presents a vast array of features (approvals, revisions, feedback, patents, marketplace, pricing) that are either completely unimplemented or fundamentally broken at the API layer.

The only truly working path is the **Core Generation Flow**:
1. User enters via `/invent` or `/gallery`.
2. `UniversalCreatorFlow` interprets the request.
3. `/api/invent` creates the job and dispatches the CAD worker.
4. `JobLiveHydration` polls until completion.
5. `JobPreviewPanel` renders the STL.

Everything else is a distraction or a dead end.

## 3. Convergence Plan

To achieve Reality Lock, we must ruthlessly prune the deceptive affordances and converge all entry points onto the Core Generation Flow.

1. **Homepage CTA:** Change "Start Creating Free" to route directly to `/invent` (or `/login?redirect=/invent` if unauthenticated).
2. **Dual Lane Section:** Remove the "Shop" vs "Fun" distinction. Simplify to a single "Start Inventing" CTA that routes to `/invent`.
3. **Job Detail Page:** Remove `ApprovalPanel`, `RevisionPanel`, `FeedbackUploadWidget`, `InventionProtectionPanel`, `TagEditor`, and the Print Result actions. The page should only show the Preview, Spec Summary, VPL, and Share panels.
4. **Navigation:** Remove links to `/marketplace` and `/pricing` from the header and footer.

This will result in a smaller, but 100% honest and functional application.
