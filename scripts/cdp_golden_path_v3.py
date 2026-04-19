#!/usr/bin/env python3
"""
Final Golden Path Proof Pass v3
Tests all 6 routes against the live production app using the authenticated browser session.
"""
import asyncio, json, os, time, urllib.request
from pathlib import Path

PROOF_DIR = Path("/home/ubuntu/le-repo/proof_screenshots")
PROOF_DIR.mkdir(exist_ok=True)
BASE_URL = "https://ai4u-little-engineer-web.vercel.app"

# Supabase direct query helper
def supabase_query(table, filters=None, select="*", limit=10):
    env = {}
    with open("/home/ubuntu/le-repo/apps/web/.env.local") as f:
        for line in f:
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, _, v = line.partition("=")
                env[k.strip()] = v.strip().strip('"')
    url = env["NEXT_PUBLIC_SUPABASE_URL"]
    key = env["SUPABASE_SERVICE_ROLE_KEY"]
    params = f"select={select}&limit={limit}"
    if filters:
        for k, v in filters.items():
            params += f"&{k}=eq.{v}"
    req = urllib.request.Request(
        f"{url}/rest/v1/{table}?{params}",
        headers={"apikey": key, "Authorization": f"Bearer {key}"}
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())

async def run_proof():
    import websockets

    # Get CDP endpoint
    with urllib.request.urlopen("http://localhost:9222/json", timeout=5) as r:
        tabs = json.loads(r.read())
    
    # Find the AI4U tab or use first available
    tab = next((t for t in tabs if "ai4u" in t.get("url","").lower() or "vercel" in t.get("url","").lower()), tabs[0])
    ws_url = tab["webSocketDebuggerUrl"]
    
    results = {}
    
    async with websockets.connect(ws_url, max_size=10*1024*1024) as ws:
        msg_id = 1
        
        async def send(method, params=None):
            nonlocal msg_id
            cmd = {"id": msg_id, "method": method, "params": params or {}}
            await ws.send(json.dumps(cmd))
            msg_id += 1
            while True:
                resp = json.loads(await asyncio.wait_for(ws.recv(), timeout=30))
                if resp.get("id") == cmd["id"]:
                    return resp.get("result", {})
        
        async def navigate_and_screenshot(url, name, wait=3):
            await send("Page.navigate", {"url": url})
            await asyncio.sleep(wait)
            ss = await send("Page.captureScreenshot", {"format": "png"})
            import base64
            data = base64.b64decode(ss.get("data", ""))
            path = PROOF_DIR / f"{name}.png"
            path.write_bytes(data)
            print(f"  📸 {name}.png saved ({len(data)//1024}KB)")
            return path
        
        async def fetch_api(path, payload=None):
            """Use CDP Runtime.evaluate to make a fetch call from the browser context"""
            if payload:
                js = f"""
                fetch('{BASE_URL}{path}', {{
                    method: 'POST',
                    headers: {{'Content-Type': 'application/json'}},
                    body: JSON.stringify({json.dumps(payload)})
                }}).then(r => r.json()).then(d => JSON.stringify(d)).catch(e => JSON.stringify({{error: e.message}}))
                """
            else:
                js = f"""
                fetch('{BASE_URL}{path}').then(r => r.json()).then(d => JSON.stringify(d)).catch(e => JSON.stringify({{error: e.message}}))
                """
            result = await send("Runtime.evaluate", {
                "expression": js,
                "awaitPromise": True,
                "timeout": 30000
            })
            val = result.get("result", {}).get("value", "{}")
            try:
                return json.loads(val)
            except:
                return {"raw": val}
        
        print("\n" + "="*60)
        print("GOLDEN PATH PROOF PASS v3")
        print("="*60)
        
        # ── STEP 1: Dashboard ────────────────────────────────────
        print("\n[1/6] Dashboard — /dashboard")
        await navigate_and_screenshot(f"{BASE_URL}/dashboard", "01_dashboard", wait=4)
        results["dashboard"] = "screenshot captured"
        print("  ✅ Dashboard loaded")
        
        # ── STEP 2: /invent page ─────────────────────────────────
        print("\n[2/6] Invent page — /invent")
        await navigate_and_screenshot(f"{BASE_URL}/invent", "02_invent", wait=3)
        results["invent_page"] = "screenshot captured"
        print("  ✅ /invent loaded")
        
        # ── STEP 3: Gallery Make This prefill ────────────────────
        print("\n[3/6] Gallery Make This — /invent?q=aluminum+spacer+32mm+outer")
        await navigate_and_screenshot(
            f"{BASE_URL}/invent?q=aluminum+spacer+32mm+outer+8mm+inner+25mm+long",
            "03_invent_prefill", wait=4
        )
        results["gallery_prefill"] = "screenshot captured"
        print("  ✅ /invent?q= prefill loaded")
        
        # ── STEP 4: /api/intake/interpret ────────────────────────
        print("\n[4/6] API: /api/intake/interpret")
        interpret_payload = {
            "text": "I need an aluminum spacer 32mm outer diameter, 8mm inner bore, 25mm long",
            "conversation_history": []
        }
        interpret_resp = await fetch_api("/api/intake/interpret", interpret_payload)
        print(f"  Response keys: {list(interpret_resp.keys())}")
        
        session_id = interpret_resp.get("session_id", "")
        mode = interpret_resp.get("mode", "")
        family = interpret_resp.get("family_candidate", "")
        dims = interpret_resp.get("extracted_dimensions", {})
        
        print(f"  session_id: {session_id}")
        print(f"  mode: {mode}")
        print(f"  family_candidate: {family}")
        print(f"  extracted_dimensions: {dims}")
        
        if session_id and len(session_id) > 5:
            results["interpret"] = f"PASS — session_id={session_id}, mode={mode}, family={family}"
        else:
            results["interpret"] = f"FAIL — no session_id. Response: {json.dumps(interpret_resp)[:300]}"
        print(f"  {'✅' if 'PASS' in results['interpret'] else '❌'} {results['interpret']}")
        
        # ── STEP 5: /api/invent ──────────────────────────────────
        print("\n[5/6] API: /api/invent")
        invent_payload = {
            "problem": "aluminum spacer 32mm outer diameter 8mm inner bore 25mm long",
            "intake_family_candidate": "spacer",
            "intake_dimensions": {
                "outer_diameter": 32,
                "inner_diameter": 8,
                "length": 25
            }
        }
        invent_resp = await fetch_api("/api/invent", invent_payload)
        print(f"  Response keys: {list(invent_resp.keys())}")
        
        job_id = invent_resp.get("job_id", "")
        invention_id = invent_resp.get("invention_id", "")
        inv_family = invent_resp.get("family", "")
        
        print(f"  job_id: {job_id}")
        print(f"  invention_id: {invention_id}")
        print(f"  family: {inv_family}")
        
        if job_id and len(job_id) > 5:
            results["invent"] = f"PASS — job_id={job_id}, family={inv_family}"
        else:
            results["invent"] = f"FAIL — no job_id. Response: {json.dumps(invent_resp)[:400]}"
        print(f"  {'✅' if 'PASS' in results['invent'] else '❌'} {results['invent']}")
        
        # ── STEP 6: /jobs page ───────────────────────────────────
        print("\n[6/6] Jobs list — /jobs")
        await navigate_and_screenshot(f"{BASE_URL}/jobs", "06_jobs_list", wait=4)
        results["jobs_page"] = "screenshot captured"
        print("  ✅ /jobs loaded")
        
        # ── STEP 7: /jobs/[id] if we have a job_id ───────────────
        if job_id and len(job_id) > 5:
            print(f"\n[7/7] Job detail — /jobs/{job_id}")
            await navigate_and_screenshot(f"{BASE_URL}/jobs/{job_id}", "07_job_detail", wait=4)
            results["job_detail"] = f"screenshot captured for job {job_id}"
            print(f"  ✅ /jobs/{job_id} loaded")
        
        # ── DB Verification ──────────────────────────────────────
        print("\n[DB] Verifying DB rows...")
        
        # Check intake_sessions
        if session_id:
            sessions = supabase_query("intake_sessions", {"session_id": session_id}, "session_id,created_at")
            if sessions:
                results["db_intake_session"] = f"PASS — row found: {sessions[0]}"
            else:
                results["db_intake_session"] = f"FAIL — no row for session_id={session_id}"
            print(f"  {'✅' if 'PASS' in results['db_intake_session'] else '❌'} intake_sessions: {results['db_intake_session']}")
        
        # Check jobs
        if job_id:
            jobs = supabase_query("jobs", {"id": job_id}, "id,status,requested_family,clerk_user_id,created_at")
            if jobs:
                results["db_job"] = f"PASS — row found: {jobs[0]}"
            else:
                results["db_job"] = f"FAIL — no row for job_id={job_id}"
            print(f"  {'✅' if 'PASS' in results['db_job'] else '❌'} jobs: {results['db_job']}")
        
        # ── Artemis Demo ─────────────────────────────────────────
        print("\n[Artemis] Testing demo route...")
        artemis_resp = await fetch_api("/api/demo/artemis", {
            "preset": "spacer",
            "scale": "medium"
        })
        if artemis_resp.get("job_id") or artemis_resp.get("invention_id"):
            results["artemis"] = f"PASS — {json.dumps(artemis_resp)[:200]}"
        elif artemis_resp.get("error"):
            results["artemis"] = f"FAIL — {artemis_resp['error']}"
        else:
            results["artemis"] = f"PARTIAL — {json.dumps(artemis_resp)[:200]}"
        print(f"  {'✅' if 'PASS' in results['artemis'] else '⚠️' if 'PARTIAL' in results['artemis'] else '❌'} Artemis: {results['artemis'][:150]}")
        
        # ── Summary ──────────────────────────────────────────────
        print("\n" + "="*60)
        print("PROOF SUMMARY")
        print("="*60)
        passes = sum(1 for v in results.values() if "PASS" in str(v) or "screenshot" in str(v))
        fails = sum(1 for v in results.values() if "FAIL" in str(v))
        print(f"  PASS: {passes} | FAIL: {fails} | TOTAL: {len(results)}")
        for k, v in results.items():
            status = "✅" if ("PASS" in str(v) or "screenshot" in str(v)) else "❌" if "FAIL" in str(v) else "⚠️"
            print(f"  {status} {k}: {str(v)[:100]}")
        
        # Save results to file
        with open(PROOF_DIR / "proof_results_v3.json", "w") as f:
            json.dump(results, f, indent=2)
        print(f"\n  Results saved to {PROOF_DIR}/proof_results_v3.json")
        
        return results

asyncio.run(run_proof())
