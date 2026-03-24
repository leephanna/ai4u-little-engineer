# Deployment Normalization

## The Problem
The repository had a split-brain branching strategy. The active development branch is `master`, but three critical GitHub Actions workflows were hardcoded to trigger only on `main`:
- `cad-worker-ci.yml`
- `trigger-deploy.yml`
- `web-ci.yml`

This meant that pushes to `master` were silently ignored by CI/CD, leading to a false sense of security and outdated deployments.

## The Fix
All workflow files have been updated to trigger on `master` instead of `main`.

### Files Modified:
1. **`.github/workflows/cad-worker-ci.yml`**
   - Changed `push.branches` from `[main, develop]` to `[master, develop]`
   - Changed `pull_request.branches` from `[main]` to `[master]`
   - Changed `deploy-production` condition from `github.ref == 'refs/heads/main'` to `github.ref == 'refs/heads/master'`

2. **`.github/workflows/trigger-deploy.yml`**
   - Changed `push.branches` from `[main]` to `[master]`

3. **`.github/workflows/web-ci.yml`**
   - Changed `push.branches` from `[main, develop]` to `[master, develop]`
   - Changed `pull_request.branches` from `[main]` to `[master]`
   - Changed `deploy-production` condition from `github.ref == 'refs/heads/main'` to `github.ref == 'refs/heads/master'`

## Vercel Integration Note
Vercel is currently connected to the repository via its native GitHub integration, which automatically deploys pushes to `master`. The `web-ci.yml` workflow also attempts to deploy to Vercel using the CLI, which is redundant but serves as a fallback.

## Cloud Run Note
The `deploy-cad-worker.yml` workflow (which was already targeting `master`) remains in the repository but is effectively disabled because the required GCP secrets (`GCP_SA_KEY`, `GCP_PROJECT_ID`) are not set in the repository. This is intentional, as we are migrating the CAD worker to Render.
