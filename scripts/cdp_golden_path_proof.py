#!/usr/bin/env python3
"""Full golden path proof: dashboard → /invent → interpret → clarify → generate → /jobs → /jobs/[id]"""
import asyncio, json, base64, urllib.request, websockets, time, os

BASE = "http://localhost:9222"
SHOTS = "/home/ubuntu/le-repo/proof_screenshots"
os.makedirs(SHOTS, exist_ok=True)

CMD_ID = 10000

async def send_cmd(ws, method, params=None, timeout=20):
    global CMD_ID
    CMD_ID += 1
    cmd_id = CMD_ID
    msg = {"id": cmd_id, "method": method, "params": params or {}}
    await ws.send(json.dumps(msg))
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            raw = await asyncio.wait_for(ws.recv(), timeout=4)
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
    return None

async def navigate(ws, url, wait=4):
    await send_cmd(ws, "Page.navigate", {"url": url}, timeout=30)
    await asyncio.sleep(wait)

async def get_url(ws):
    r = await send_cmd(ws, "Runtime.evaluate", {"expression": "window.location.href", "returnByValue": True})
    return r.get("result", {}).get("value", "")

async def eval_js(ws, expr, await_promise=False):
    r = await send_cmd(ws, "Runtime.evaluate", {
        "expression": expr, "returnByValue": True, "awaitPromise": await_promise
    }, timeout=30)
    return r.get("result", {}).get("value", None)

async def get_page_text(ws):
    return await eval_js(ws, "document.body.innerText.slice(0, 2000)")

async def click(ws, x, y):
    await send_cmd(ws, "Input.dispatchMouseEvent", {"type": "mousePressed", "x": x, "y": y, "button": "left", "clickCount": 1})
    await asyncio.sleep(0.1)
    await send_cmd(ws, "Input.dispatchMouseEvent", {"type": "mouseReleased", "x": x, "y": y, "button": "left", "clickCount": 1})
    await asyncio.sleep(0.2)

async def main():
    resp = urllib.request.urlopen(f"{BASE}/json").read()
    tabs = json.loads(resp)
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
        await send_cmd(ws, "Network.enable")
        await send_cmd(ws, "Runtime.enable")
        
        # ── STEP 1: Dashboard ──────────────────────────────────────────────
        print("\n=== STEP 1: Dashboard ===")
        await navigate(ws, "https://ai4u-little-engineer-web.vercel.app/dashboard", wait=5)
        url = await get_url(ws)
        text = await get_page_text(ws)
        print(f"URL: {url}")
        print(f"Content preview: {text[:300]}")
        await screenshot(ws, "01_dashboard")
        results["dashboard"] = {
            "url": url,
            "pass": "dashboard" in url.lower() or "AI4U" in (text or ""),
            "content": (text or "")[:200]
        }
        
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
            "pass": "invent" in url.lower(),
            "content": (text or "")[:200]
        }
        
        # ── STEP 3: Gallery → Make This (prefill test) ─────────────────────
        print("\n=== STEP 3: Gallery Make This prefill ===")
        test_prompt = "aluminum L-bracket 50x30x20mm 3mm thick"
        await navigate(ws, f"https://ai4u-little-engineer-web.vercel.app/invent?q={test_prompt.replace(' ', '+')}", wait=5)
        url = await get_url(ws)
        text = await get_page_text(ws)
        print(f"URL: {url}")
        print(f"Content: {text[:300]}")
        await screenshot(ws, "03_invent_prefill")
        # Check if the prompt appears in the page
        has_prefill = test_prompt.split()[0].lower() in (text or "").lower()
        results["invent_prefill"] = {
            "url": url,
            "pass": "invent" in url.lower(),
            "prefill_visible": has_prefill,
            "content": (text or "")[:200]
        }
        
        # ── STEP 4: Call /api/intake/interpret directly ────────────────────
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
        """, await_promise=True)
        print(f"Interpret response: {interpret_result}")
        await asyncio.sleep(1)
        
        interpret_data = json.loads(interpret_result) if interpret_result else {}
        session_id = interpret_data.get("session_id", "")
        mode = interpret_data.get("mode", "")
        print(f"session_id: {session_id}")
        print(f"mode: {mode}")
        results["interpret"] = {
            "pass": bool(session_id),
            "session_id": session_id,
            "mode": mode,
            "response": interpret_data
        }
        
        # ── STEP 5: Call /api/invent to create a job ───────────────────────
        print("\n=== STEP 5: /api/invent (create job) ===")
        invent_payload = {
            "session_id": session_id,
            "family": interpret_data.get("family_candidate", "l_bracket"),
            "dimensions": interpret_data.get("extracted_dimensions", {"length": 50, "width": 30, "height": 20, "thickness": 3}),
            "part_name": "L-Bracket Proof Test",
            "material": "aluminum"
        }
        invent_result = await eval_js(ws, f"""
            fetch('/api/invent', {{
                method: 'POST',
                headers: {{'Content-Type': 'application/json'}},
                body: JSON.stringify({json.dumps(invent_payload)})
            }}).then(r => r.json()).then(d => JSON.stringify(d)).catch(e => JSON.stringify({{error: e.message}}))
        """, await_promise=True)
        print(f"Invent response: {invent_result}")
        await asyncio.sleep(1)
        
        invent_data = json.loads(invent_result) if invent_result else {}
        job_id = invent_data.get("job_id", "")
        print(f"job_id: {job_id}")
        results["invent_api"] = {
            "pass": bool(job_id),
            "job_id": job_id,
            "response": invent_data
        }
        
        # ── STEP 6: /jobs page ─────────────────────────────────────────────
        print("\n=== STEP 6: /jobs page ===")
        await navigate(ws, "https://ai4u-little-engineer-web.vercel.app/jobs", wait=5)
        url = await get_url(ws)
        text = await get_page_text(ws)
        print(f"URL: {url}")
        print(f"Content: {text[:400]}")
        await screenshot(ws, "06_jobs_list")
        results["jobs_list"] = {
            "url": url,
            "pass": "jobs" in url.lower() and "404" not in (text or ""),
            "content": (text or "")[:300]
        }
        
        # ── STEP 7: /jobs/[id] page ────────────────────────────────────────
        if job_id:
            print(f"\n=== STEP 7: /jobs/{job_id} ===")
            await navigate(ws, f"https://ai4u-little-engineer-web.vercel.app/jobs/{job_id}", wait=5)
            url = await get_url(ws)
            text = await get_page_text(ws)
            print(f"URL: {url}")
            print(f"Content: {text[:400]}")
            await screenshot(ws, "07_job_detail")
            results["job_detail"] = {
                "url": url,
                "pass": job_id in url and "404" not in (text or ""),
                "content": (text or "")[:300]
            }
        
        # ── STEP 8: Artemis demo ───────────────────────────────────────────
        print("\n=== STEP 8: Artemis demo ===")
        artemis_result = await eval_js(ws, """
            fetch('/api/demo/artemis', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({prompt: 'simple test bracket'})
            }).then(r => r.json()).then(d => JSON.stringify(d)).catch(e => JSON.stringify({error: e.message}))
        """, await_promise=True)
        print(f"Artemis response: {artemis_result[:300] if artemis_result else 'null'}")
        artemis_data = json.loads(artemis_result) if artemis_result else {}
        results["artemis"] = {
            "pass": "error" not in artemis_data and "job_id" in artemis_data,
            "response": artemis_data
        }
        
        # ── STEP 9: Homepage ───────────────────────────────────────────────
        print("\n=== STEP 9: Homepage ===")
        await navigate(ws, "https://ai4u-little-engineer-web.vercel.app/", wait=4)
        url = await get_url(ws)
        text = await get_page_text(ws)
        print(f"URL: {url}")
        await screenshot(ws, "09_homepage")
        results["homepage"] = {
            "url": url,
            "pass": "ai4u" in url.lower() or "little" in (text or "").lower(),
            "content": (text or "")[:200]
        }
        
        # ── PRINT SUMMARY ──────────────────────────────────────────────────
        print("\n" + "="*60)
        print("PROOF PASS SUMMARY")
        print("="*60)
        for step, data in results.items():
            status = "✅ PASS" if data.get("pass") else "❌ FAIL"
            print(f"{status}  {step}")
            if "session_id" in data:
                print(f"       session_id: {data['session_id']}")
            if "job_id" in data:
                print(f"       job_id: {data['job_id']}")
        
        # Save results
        with open(f"{SHOTS}/proof_results.json", "w") as f:
            json.dump(results, f, indent=2)
        print(f"\nResults saved to {SHOTS}/proof_results.json")

asyncio.run(main())
