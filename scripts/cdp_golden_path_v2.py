#!/usr/bin/env python3
"""Full golden path proof v2: correct invent payload + artemis + dashboard + /jobs"""
import asyncio, json, base64, urllib.request, websockets, time, os

BASE = "http://localhost:9222"
SHOTS = "/home/ubuntu/le-repo/proof_screenshots"
os.makedirs(SHOTS, exist_ok=True)

CMD_ID = 20000

async def send_cmd(ws, method, params=None, timeout=25):
    global CMD_ID
    CMD_ID += 1
    cmd_id = CMD_ID
    msg = {"id": cmd_id, "method": method, "params": params or {}}
    await ws.send(json.dumps(msg))
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            raw = await asyncio.wait_for(ws.recv(), timeout=5)
            data = json.loads(raw)
            if data.get("id") == cmd_id:
                return data.get("result", {})
        except asyncio.TimeoutError:
            continue
    return {}

async def screenshot(ws, name):
    r = await send_cmd(ws, "Page.captureScreenshot", {"format": "png", "quality": 85}, timeout=20)
    data = r.get("data", "")
    if data:
        path = f"{SHOTS}/{name}.png"
        with open(path, "wb") as f:
            f.write(base64.b64decode(data))
        print(f"  📸 {path}")
        return path
    print(f"  ⚠️  No screenshot data for {name}")
    return None

async def navigate(ws, url, wait=5):
    await send_cmd(ws, "Page.navigate", {"url": url}, timeout=30)
    await asyncio.sleep(wait)

async def get_url(ws):
    r = await send_cmd(ws, "Runtime.evaluate", {"expression": "window.location.href", "returnByValue": True})
    return r.get("result", {}).get("value", "")

async def eval_js(ws, expr, await_promise=False, timeout=30):
    r = await send_cmd(ws, "Runtime.evaluate", {
        "expression": expr, "returnByValue": True, "awaitPromise": await_promise
    }, timeout=timeout)
    return r.get("result", {}).get("value", None)

async def get_page_text(ws):
    return await eval_js(ws, "document.body.innerText.slice(0, 3000)")

async def main():
    resp = urllib.request.urlopen(f"{BASE}/json").read()
    tabs = json.loads(resp)
    # Find the vercel.app tab
    target = None
    for t in tabs:
        if t.get("type") == "page" and "vercel.app" in t.get("url", ""):
            target = t
            break
    if not target:
        target = [t for t in tabs if t.get("type") == "page"][0]
    
    print(f"Tab: {target['id'][:8]} | {target.get('url','')[:80]}")
    results = {}
    
    async with websockets.connect(target["webSocketDebuggerUrl"], max_size=10_000_000) as ws:
        await send_cmd(ws, "Page.enable")
        await send_cmd(ws, "Runtime.enable")
        
        # ── STEP 1: Dashboard ──────────────────────────────────────────────
        print("\n=== STEP 1: Dashboard ===")
        await navigate(ws, "https://ai4u-little-engineer-web.vercel.app/dashboard", wait=6)
        url = await get_url(ws)
        text = await get_page_text(ws)
        print(f"URL: {url}")
        print(f"Content: {text[:400]}")
        await screenshot(ws, "01_dashboard")
        
        # Check auth state
        is_authed = "sign-in" not in url and "Sign Out" in (text or "")
        print(f"Authenticated: {is_authed}")
        
        results["dashboard"] = {
            "url": url,
            "authenticated": is_authed,
            "pass": is_authed and "dashboard" in url.lower(),
            "content_preview": (text or "")[:300]
        }
        
        if not is_authed:
            print("❌ NOT AUTHENTICATED — stopping proof pass")
            with open(f"{SHOTS}/proof_results_v2.json", "w") as f:
                json.dump({"error": "Not authenticated", "url": url}, f, indent=2)
            return
        
        # ── STEP 2: /invent page ───────────────────────────────────────────
        print("\n=== STEP 2: /invent page ===")
        await navigate(ws, "https://ai4u-little-engineer-web.vercel.app/invent", wait=5)
        url = await get_url(ws)
        text = await get_page_text(ws)
        print(f"URL: {url}")
        print(f"Content: {text[:300]}")
        await screenshot(ws, "02_invent")
        results["invent"] = {
            "url": url,
            "pass": "invent" in url.lower() and "sign-in" not in url,
            "content": (text or "")[:200]
        }
        
        # ── STEP 3: Gallery Make This prefill ─────────────────────────────
        print("\n=== STEP 3: Gallery Make This prefill ===")
        await navigate(ws, "https://ai4u-little-engineer-web.vercel.app/invent?q=aluminum+L-bracket+50x30x20mm+3mm+thick", wait=5)
        url = await get_url(ws)
        text = await get_page_text(ws)
        print(f"URL: {url}")
        print(f"Content: {text[:400]}")
        await screenshot(ws, "03_invent_prefill")
        # Check if the prefill triggered auto-submit (look for "Current Print Plan" or "Mode" in content)
        has_auto_submitted = "Current Print Plan" in (text or "") or "parametric" in (text or "").lower()
        results["invent_prefill"] = {
            "url": url,
            "pass": "invent" in url.lower(),
            "auto_submitted": has_auto_submitted,
            "content": (text or "")[:300]
        }
        
        # ── STEP 4: /api/intake/interpret ─────────────────────────────────
        print("\n=== STEP 4: /api/intake/interpret ===")
        interpret_result = await eval_js(ws, """
            fetch('/api/intake/interpret', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    text: 'aluminum L-bracket 50x30x20mm 3mm thick',
                    conversation_history: []
                })
            }).then(r => r.json()).then(d => JSON.stringify(d)).catch(e => JSON.stringify({error: e.message}))
        """, await_promise=True, timeout=30)
        print(f"Interpret response: {interpret_result}")
        
        interpret_data = json.loads(interpret_result) if interpret_result else {}
        session_id = interpret_data.get("session_id", "")
        mode = interpret_data.get("mode", "")
        family = interpret_data.get("family_candidate", "l_bracket")
        dims = interpret_data.get("extracted_dimensions", {"length": 50, "width": 30, "height": 20, "thickness": 3})
        print(f"session_id: {session_id}")
        print(f"mode: {mode}, family: {family}")
        results["interpret"] = {
            "pass": bool(session_id) and mode != "",
            "session_id": session_id,
            "mode": mode,
            "family": family,
            "dimensions": dims
        }
        
        # ── STEP 5: /api/invent (create job) ──────────────────────────────
        print("\n=== STEP 5: /api/invent (create job) ===")
        # Use 'problem' field (not 'part_name') — the route accepts problem or text
        invent_payload = {
            "problem": "aluminum L-bracket 50x30x20mm 3mm thick",
            "session_id": session_id,
        }
        invent_result = await eval_js(ws, f"""
            fetch('/api/invent', {{
                method: 'POST',
                headers: {{'Content-Type': 'application/json'}},
                body: JSON.stringify({json.dumps(invent_payload)})
            }}).then(r => r.json()).then(d => JSON.stringify(d)).catch(e => JSON.stringify({{error: e.message}}))
        """, await_promise=True, timeout=45)
        print(f"Invent response: {invent_result}")
        
        invent_data = json.loads(invent_result) if invent_result else {}
        job_id = invent_data.get("job_id", "")
        print(f"job_id: {job_id}")
        results["invent_api"] = {
            "pass": bool(job_id),
            "job_id": job_id,
            "response": {k: v for k, v in invent_data.items() if k != "daedalus_receipt"}
        }
        
        # ── STEP 6: /jobs page ─────────────────────────────────────────────
        print("\n=== STEP 6: /jobs page ===")
        await navigate(ws, "https://ai4u-little-engineer-web.vercel.app/jobs", wait=5)
        url = await get_url(ws)
        text = await get_page_text(ws)
        print(f"URL: {url}")
        print(f"Content: {text[:500]}")
        await screenshot(ws, "06_jobs_list")
        has_jobs = "No parts" not in (text or "") and "No parts generated" not in (text or "")
        results["jobs_list"] = {
            "url": url,
            "pass": "jobs" in url.lower() and "404" not in (text or ""),
            "shows_jobs": has_jobs,
            "content": (text or "")[:400]
        }
        
        # ── STEP 7: /jobs/[id] page ────────────────────────────────────────
        if job_id:
            print(f"\n=== STEP 7: /jobs/{job_id} ===")
            await navigate(ws, f"https://ai4u-little-engineer-web.vercel.app/jobs/{job_id}", wait=5)
            url = await get_url(ws)
            text = await get_page_text(ws)
            print(f"URL: {url}")
            print(f"Content: {text[:500]}")
            await screenshot(ws, "07_job_detail")
            results["job_detail"] = {
                "url": url,
                "pass": job_id in url and "404" not in (text or "") and "not found" not in (text or "").lower(),
                "content": (text or "")[:400]
            }
        
        # ── STEP 8: Artemis demo ───────────────────────────────────────────
        print("\n=== STEP 8: Artemis demo ===")
        # Navigate to homepage first so the fetch is same-origin
        await navigate(ws, "https://ai4u-little-engineer-web.vercel.app/", wait=3)
        artemis_result = await eval_js(ws, """
            fetch('/api/demo/artemis', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({scale: 'small', material: 'PLA', quality: 'draft'})
            }).then(r => r.json()).then(d => JSON.stringify(d)).catch(e => JSON.stringify({error: e.message}))
        """, await_promise=True, timeout=45)
        print(f"Artemis response: {artemis_result[:400] if artemis_result else 'null'}")
        artemis_data = json.loads(artemis_result) if artemis_result else {}
        artemis_job_id = artemis_data.get("job_id", "")
        results["artemis"] = {
            "pass": bool(artemis_job_id) and "error" not in artemis_data,
            "job_id": artemis_job_id,
            "response_keys": list(artemis_data.keys())
        }
        
        # ── STEP 9: Homepage ───────────────────────────────────────────────
        print("\n=== STEP 9: Homepage ===")
        await navigate(ws, "https://ai4u-little-engineer-web.vercel.app/", wait=4)
        url = await get_url(ws)
        text = await get_page_text(ws)
        await screenshot(ws, "09_homepage")
        results["homepage"] = {
            "url": url,
            "pass": "sign-in" not in url,
            "has_header": "Sign Out" in (text or "") or "Invent" in (text or ""),
            "content": (text or "")[:200]
        }
        
        # ── STEP 10: Dashboard with jobs ──────────────────────────────────
        print("\n=== STEP 10: Dashboard (post-job creation) ===")
        await navigate(ws, "https://ai4u-little-engineer-web.vercel.app/dashboard", wait=6)
        url = await get_url(ws)
        text = await get_page_text(ws)
        print(f"URL: {url}")
        print(f"Content: {text[:500]}")
        await screenshot(ws, "10_dashboard_with_jobs")
        results["dashboard_post"] = {
            "url": url,
            "pass": "dashboard" in url.lower(),
            "content": (text or "")[:400]
        }
        
        # ── PRINT SUMMARY ──────────────────────────────────────────────────
        print("\n" + "="*60)
        print("PROOF PASS SUMMARY")
        print("="*60)
        all_pass = True
        for step, data in results.items():
            status = "✅ PASS" if data.get("pass") else "❌ FAIL"
            if not data.get("pass"):
                all_pass = False
            print(f"{status}  {step}")
            for key in ["session_id", "job_id", "mode", "family", "authenticated", "shows_jobs", "auto_submitted"]:
                if key in data:
                    print(f"       {key}: {data[key]}")
        
        print(f"\nOverall: {'✅ ALL PASS' if all_pass else '⚠️  SOME FAILURES'}")
        
        # Save results
        with open(f"{SHOTS}/proof_results_v2.json", "w") as f:
            json.dump(results, f, indent=2)
        print(f"Results saved to {SHOTS}/proof_results_v2.json")

asyncio.run(main())
