#!/usr/bin/env python3
"""Apply migration 016 via Supabase Management API."""
import requests
import sys

PROJECT_REF = "lphtdosxneplxgkygjom"
MIGRATION_TOKEN = "sbp_cd8e98f0a267c20dedde594987f21a611cf7c230"

with open("/home/ubuntu/le-repo/packages/db/migrations/016_clerk_nullable_user_id.sql") as f:
    sql = f.read()

url = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"
headers = {
    "Authorization": f"Bearer {MIGRATION_TOKEN}",
    "Content-Type": "application/json",
}
payload = {"query": sql}

print(f"Applying migration 016 to project {PROJECT_REF}...")
resp = requests.post(url, headers=headers, json=payload, timeout=60)
print(f"Status: {resp.status_code}")
print(f"Response: {resp.text[:2000]}")

if resp.status_code in (200, 201):
    print("\n✅ Migration 016 applied successfully")
    sys.exit(0)
else:
    print("\n❌ Migration 016 failed")
    sys.exit(1)
