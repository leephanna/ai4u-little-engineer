import requests
import json
import sys

import os
VERCEL_TOKEN = os.environ.get("VERCEL_TOKEN", "")
TEAM_ID = "team_tijiRx4i1cQPPiNUA5HJFxOE"
PROJECT_ID = "prj_ypBKnm0KbFrWqxwvJ0SkAe5RJOnF"
HEADERS = {"Authorization": f"Bearer {VERCEL_TOKEN}", "Content-Type": "application/json"}

r = requests.get(
    f"https://api.vercel.com/v9/projects/{PROJECT_ID}/env?teamId={TEAM_ID}",
    headers=HEADERS,
    timeout=15,
)
print(f"Status: {r.status_code}")
data = r.json()
envs = data.get("envs", [])
print(f"Found {len(envs)} env vars:")
for e in envs:
    targets = e.get("target", [])
    print(f"  {e['key']} [{','.join(targets) if isinstance(targets, list) else targets}]")
