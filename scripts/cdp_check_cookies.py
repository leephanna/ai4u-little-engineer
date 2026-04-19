#!/usr/bin/env python3
"""Check current cookie state and attempt to navigate to the dashboard."""
import asyncio, json, base64, os, urllib.request, websockets, time

BASE = "http://localhost:9222"
SCREENSHOTS_DIR = "/home/ubuntu/le-repo/proof_screenshots"
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

CMD_ID = 2000

async def send_cmd(ws, method, params=None, timeout=20):
    global CMD_ID
    CMD_ID += 1
    cmd_id = CMD_ID
    msg = {"id": cmd_id, "method": method, "params": params or {}}
    await ws.send(json.dumps(msg))
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            raw = await asyncio.wait_for(ws.recv(), timeout=3)
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
        path = f"{SCREENSHOTS_DIR}/{name}.png"
        with open(path, "wb") as f:
            f.write(base64.b64decode(data))
        print(f"  📸 {path}")
        return path
    return None

async def main():
    resp = urllib.request.urlopen(f"{BASE}/json").read()
    tabs = json.loads(resp)
    print("All tabs:")
    for t in tabs:
        print(f"  [{t['id'][:8]}] {t.get('type')} | {t.get('url','')[:80]}")
    
    # Find the vercel.app tab
    target = None
    for t in tabs:
        if t.get("type") == "page" and "vercel.app" in t.get("url", ""):
            target = t
            break
    if not target:
        target = [t for t in tabs if t.get("type") == "page"][0]
    
    print(f"\nUsing tab: {target['id'][:8]} | {target.get('url','')[:80]}")
    
    async with websockets.connect(target["webSocketDebuggerUrl"], max_size=10_000_000) as ws:
        await send_cmd(ws, "Page.enable")
        await send_cmd(ws, "Network.enable")
        await send_cmd(ws, "Runtime.enable")
        
        # Check all cookies
        r = await send_cmd(ws, "Network.getAllCookies", {})
        all_cookies = r.get("cookies", [])
        print(f"\nAll cookies ({len(all_cookies)} total):")
        for c in all_cookies:
            if any(k in c.get("name","") for k in ["clerk", "session", "client_uat", "__"]):
                print(f"  {c['name']} @ {c.get('domain','')} = {c.get('value','')[:40]}...")
        
        # Check current URL
        url_r = await send_cmd(ws, "Runtime.evaluate", {"expression": "window.location.href", "returnByValue": True})
        current_url = url_r.get("result", {}).get("value", "")
        print(f"\nCurrent URL: {current_url}")
        
        # Navigate to the app homepage first
        print("\nNavigating to app homepage...")
        await send_cmd(ws, "Page.navigate", {"url": "https://ai4u-little-engineer-web.vercel.app/"})
        await asyncio.sleep(4)
        
        url_r = await send_cmd(ws, "Runtime.evaluate", {"expression": "window.location.href", "returnByValue": True})
        current_url = url_r.get("result", {}).get("value", "")
        print(f"Homepage URL: {current_url}")
        await screenshot(ws, "cookie_check_homepage")
        
        # Check cookies again after navigating to vercel.app
        r = await send_cmd(ws, "Network.getAllCookies", {})
        all_cookies = r.get("cookies", [])
        vercel_cookies = [c for c in all_cookies if "vercel.app" in c.get("domain","") or "ai4u" in c.get("domain","")]
        print(f"\nVercel.app cookies ({len(vercel_cookies)}):")
        for c in vercel_cookies:
            print(f"  {c['name']} @ {c.get('domain','')} = {c.get('value','')[:40]}...")
        
        # Check document.cookie
        doc_cookies = await send_cmd(ws, "Runtime.evaluate", {"expression": "document.cookie", "returnByValue": True})
        print(f"\ndocument.cookie: {doc_cookies.get('result',{}).get('value','')[:200]}")
        
        # Try navigating to dashboard
        print("\nNavigating to /dashboard...")
        await send_cmd(ws, "Page.navigate", {"url": "https://ai4u-little-engineer-web.vercel.app/dashboard"})
        await asyncio.sleep(5)
        
        url_r = await send_cmd(ws, "Runtime.evaluate", {"expression": "window.location.href", "returnByValue": True})
        current_url = url_r.get("result", {}).get("value", "")
        print(f"Dashboard URL: {current_url}")
        await screenshot(ws, "cookie_check_dashboard")
        
        content = await send_cmd(ws, "Runtime.evaluate", {"expression": "document.body.innerText.slice(0, 400)", "returnByValue": True})
        print(f"Page content: {content.get('result',{}).get('value','')[:300]}")

asyncio.run(main())
