"""
Check the exact live deployment serving ai4u-little-engineer-web.vercel.app
"""
import requests
import json
import sys

import os
VERCEL_TOKEN = os.environ.get("VERCEL_TOKEN", "")
TEAM_ID = "team_tijiRx4i1cQPPiNUA5HJFxOE"
HEADERS = {"Authorization": f"Bearer {VERCEL_TOKEN}"}

# Step 1: List all projects
print("=" * 70)
print("STEP 1: List all Vercel projects")
print("=" * 70)
r = requests.get(
    f"https://api.vercel.com/v9/projects?teamId={TEAM_ID}&limit=20",
    headers=HEADERS,
    timeout=15,
)
data = r.json()
projects = data.get("projects", [])
print(f"Found {len(projects)} projects:")
for p in projects:
    aliases = p.get("alias", [])
    if isinstance(aliases, list):
        alias_str = ", ".join(a if isinstance(a, str) else a.get("domain", str(a)) for a in aliases[:3])
    else:
        alias_str = str(aliases)
    print(f"  - {p['name']} | ID: {p['id']} | aliases: {alias_str}")

# Step 2: Find the AI4U Little Engineer project
print()
print("=" * 70)
print("STEP 2: Find ai4u-little-engineer project")
print("=" * 70)

le_project = None
for p in projects:
    name = p.get("name", "").lower()
    if "little" in name or "engineer" in name or "le-" in name or "ai4u-le" in name:
        le_project = p
        print(f"FOUND: {p['name']} | ID: {p['id']}")
        break

if not le_project:
    # Try fetching by domain
    print("Not found by name. Trying to find by domain...")
    r2 = requests.get(
        f"https://api.vercel.com/v6/domains/ai4u-little-engineer-web.vercel.app?teamId={TEAM_ID}",
        headers=HEADERS,
        timeout=15,
    )
    print(f"Domain lookup status: {r2.status_code}")
    print(r2.text[:500])

    # Try all projects and check aliases
    for p in projects:
        proj_r = requests.get(
            f"https://api.vercel.com/v9/projects/{p['id']}?teamId={TEAM_ID}",
            headers=HEADERS,
            timeout=15,
        )
        proj_data = proj_r.json()
        aliases = proj_data.get("alias", [])
        for a in aliases:
            domain = a if isinstance(a, str) else a.get("domain", "")
            if "little-engineer" in domain or "ai4u-le" in domain:
                le_project = proj_data
                print(f"FOUND via alias: {p['name']} | ID: {p['id']} | domain: {domain}")
                break
        if le_project:
            break

if not le_project:
    print("ERROR: Could not find ai4u-little-engineer project in Vercel")
    print("All project names:", [p["name"] for p in projects])
    sys.exit(1)

project_id = le_project["id"]
project_name = le_project["name"]

# Step 3: Get the latest deployments
print()
print("=" * 70)
print(f"STEP 3: Get latest deployments for {project_name}")
print("=" * 70)

r3 = requests.get(
    f"https://api.vercel.com/v6/deployments?projectId={project_id}&teamId={TEAM_ID}&limit=5&target=production",
    headers=HEADERS,
    timeout=15,
)
dep_data = r3.json()
deployments = dep_data.get("deployments", [])
print(f"Found {len(deployments)} production deployments:")
for d in deployments:
    meta = d.get("meta", {})
    commit_sha = meta.get("githubCommitSha", "N/A")
    commit_msg = meta.get("githubCommitMessage", "N/A")[:60]
    state = d.get("readyState", "N/A")
    created = d.get("createdAt", 0)
    url = d.get("url", "N/A")
    print(f"  [{state}] {d['uid']}")
    print(f"    commit: {commit_sha}")
    print(f"    msg:    {commit_msg}")
    print(f"    url:    {url}")
    print()

# Step 4: Get the CURRENT production deployment
print("=" * 70)
print("STEP 4: Get current production deployment")
print("=" * 70)
r4 = requests.get(
    f"https://api.vercel.com/v9/projects/{project_id}?teamId={TEAM_ID}",
    headers=HEADERS,
    timeout=15,
)
proj_full = r4.json()
targets = proj_full.get("targets", {})
prod_target = targets.get("production", {})
if prod_target:
    meta = prod_target.get("meta", {})
    commit_sha = meta.get("githubCommitSha", "N/A")
    commit_msg = meta.get("githubCommitMessage", "N/A")
    state = prod_target.get("readyState", "N/A")
    dep_id = prod_target.get("id", "N/A")
    url = prod_target.get("url", "N/A")
    print(f"LIVE PRODUCTION DEPLOYMENT:")
    print(f"  Deployment ID: {dep_id}")
    print(f"  State:         {state}")
    print(f"  URL:           {url}")
    print(f"  Commit SHA:    {commit_sha}")
    print(f"  Commit msg:    {commit_msg}")
else:
    print("No production target found in project data")
    print("Full targets:", json.dumps(targets, indent=2)[:500])
