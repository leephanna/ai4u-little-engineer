import requests
import json

import os
VERCEL_TOKEN = os.environ.get("VERCEL_TOKEN", "")
TEAM_ID = "team_tijiRx4i1cQPPiNUA5HJFxOE"
PROJECT_ID = "prj_ypBKnm0KbFrWqxwvJ0SkAe5RJOnF"
HEADERS = {"Authorization": f"Bearer {VERCEL_TOKEN}", "Content-Type": "application/json"}

# Get all env vars
r = requests.get(
    f"https://api.vercel.com/v9/projects/{PROJECT_ID}/env?teamId={TEAM_ID}",
    headers=HEADERS,
    timeout=15,
)
data = r.json()
envs = data.get("envs", [])

# Find ADMIN_BYPASS_KEY
for e in envs:
    if e["key"] == "ADMIN_BYPASS_KEY":
        env_id = e["id"]
        print(f"Found ADMIN_BYPASS_KEY, id={env_id}")
        # Decrypt it
        r2 = requests.get(
            f"https://api.vercel.com/v9/projects/{PROJECT_ID}/env/{env_id}?teamId={TEAM_ID}",
            headers=HEADERS,
            timeout=15,
        )
        print(f"Decrypt status: {r2.status_code}")
        d2 = r2.json()
        print(f"Value: {d2.get('value', 'N/A')}")
        break
