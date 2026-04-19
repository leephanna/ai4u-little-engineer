#!/usr/bin/env python3
"""Apply migration 017 via Supabase Management API"""
import urllib.request, json, os

# Read SQL
with open("/home/ubuntu/le-repo/packages/db/migrations/017_profiles_clerk_unique_constraint.sql") as f:
    sql = f.read()

# Read env
env = {}
with open("/home/ubuntu/le-repo/apps/web/.env.local") as f:
    for line in f:
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, _, v = line.partition("=")
            env[k.strip()] = v.strip().strip('"')

migration_token = env.get("SUPABASE_MIGRATION_TOKEN", "")
supabase_url = env.get("NEXT_PUBLIC_SUPABASE_URL", "")
project_ref = supabase_url.split("//")[1].split(".")[0] if supabase_url else ""

print(f"Project ref: {project_ref}")
print(f"Migration token: {migration_token[:20]}...")

# Apply via Management API
url = f"https://api.supabase.com/v1/projects/{project_ref}/database/query"
payload = json.dumps({"query": sql}).encode()
req = urllib.request.Request(url, data=payload, method="POST")
req.add_header("Authorization", f"Bearer {migration_token}")
req.add_header("Content-Type", "application/json")

try:
    with urllib.request.urlopen(req, timeout=30) as resp:
        result = json.loads(resp.read())
        print(f"✅ Migration 017 applied: {result}")
except urllib.error.HTTPError as e:
    body = e.read().decode()
    print(f"❌ HTTP {e.code}: {body[:500]}")
except Exception as ex:
    print(f"❌ Error: {ex}")
