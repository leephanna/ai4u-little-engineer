#!/usr/bin/env python3
"""
CDP-based live proof script for AI4U Little Engineer.
Uses Chrome DevTools Protocol via websocket to navigate, screenshot, and test.
"""
import asyncio
import json
import base64
import os
import urllib.request
import websockets
import time

BASE = "http://localhost:9222"
SCREENSHOTS_DIR = "/home/ubuntu/le-repo/proof_screenshots"
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

PROD_URL = "https://ai4u-little-engineer-web.vercel.app"

async def cdp_session(ws_url):
    """Return a CDP session connected to the given websocket URL."""
    return await websockets.connect(ws_url, max_size=10_000_000)

async def send_cmd(ws, method, params=None, timeout=30):
    cmd_id = int(time.time() * 1000) % 100000
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
    raise TimeoutError(f"CDP command {method} timed out after {timeout}s")

async def screenshot(ws, name):
    result = await send_cmd(ws, "Page.captureScreenshot", {"format": "png", "quality": 90})
    data = result.get("data", "")
    path = f"{SCREENSHOTS_DIR}/{name}.png"
    with open(path, "wb") as f:
        f.write(base64.b64decode(data))
    print(f"  📸 Screenshot saved: {path}")
    return path

async def navigate(ws, url, wait=3):
    await send_cmd(ws, "Page.navigate", {"url": url})
    await asyncio.sleep(wait)
    # Wait for load
    return await send_cmd(ws, "Runtime.evaluate", {
        "expression": "document.title",
        "returnByValue": True
    })

async def get_text(ws, selector):
    result = await send_cmd(ws, "Runtime.evaluate", {
        "expression": f"document.querySelector('{selector}')?.innerText || ''",
        "returnByValue": True
    })
    return result.get("result", {}).get("value", "")

async def get_url(ws):
    result = await send_cmd(ws, "Runtime.evaluate", {
        "expression": "window.location.href",
        "returnByValue": True
    })
    return result.get("result", {}).get("value", "")

async def main():
    # Get the first real tab (New Tab)
    resp = urllib.request.urlopen(f"{BASE}/json").read()
    tabs = json.loads(resp)
    
    # Find the New Tab
    target = None
    for t in tabs:
        if t.get("title") == "New Tab" and t.get("type") == "page":
            target = t
            break
    
    if not target:
        # Use first about:blank tab
        for t in tabs:
            if t.get("type") == "page":
                target = t
                break
    
    if not target:
        print("ERROR: No usable tab found")
        return
    
    ws_url = target["webSocketDebuggerUrl"]
    print(f"Using tab: {target.get('title')} ({target.get('id')[:8]})")
    print(f"WS URL: {ws_url}")
    
    async with websockets.connect(ws_url, max_size=10_000_000) as ws:
        # Enable Page domain
        await send_cmd(ws, "Page.enable")
        await send_cmd(ws, "Runtime.enable")
        
        print("\n=== PHASE 1: BASELINE SCREENSHOTS ===")
        
        # 1. Dashboard
        print("\n1. Navigating to /dashboard...")
        await navigate(ws, f"{PROD_URL}/dashboard", wait=4)
        url = await get_url(ws)
        title_result = await send_cmd(ws, "Runtime.evaluate", {"expression": "document.title", "returnByValue": True})
        print(f"   URL: {url}")
        print(f"   Title: {title_result.get('result', {}).get('value', '')}")
        await screenshot(ws, "01_dashboard_before")
        
        # 2. /invent
        print("\n2. Navigating to /invent...")
        await navigate(ws, f"{PROD_URL}/invent", wait=4)
        url = await get_url(ws)
        print(f"   URL: {url}")
        await screenshot(ws, "02_invent_before")
        
        # 3. /jobs
        print("\n3. Navigating to /jobs...")
        await navigate(ws, f"{PROD_URL}/jobs", wait=4)
        url = await get_url(ws)
        print(f"   URL: {url}")
        await screenshot(ws, "03_jobs_before")
        
        # 4. /demo/artemis
        print("\n4. Navigating to /demo/artemis...")
        await navigate(ws, f"{PROD_URL}/demo/artemis", wait=4)
        url = await get_url(ws)
        print(f"   URL: {url}")
        await screenshot(ws, "04_artemis_before")
        
        print("\n=== PHASE 2: GOLDEN PATH TEST ===")
        
        # Navigate to /invent
        print("\n5. Navigating to /invent for golden path test...")
        await navigate(ws, f"{PROD_URL}/invent", wait=4)
        url = await get_url(ws)
        print(f"   URL: {url}")
        await screenshot(ws, "05_invent_golden_path_start")
        
        # Check if we're on the invent page or redirected to sign-in
        is_signin = "sign-in" in url or "accounts.clerk" in url or "clerk.accounts" in url
        print(f"   Auth state: {'REDIRECTED TO SIGN-IN' if is_signin else 'ON INVENT PAGE'}")
        
        if is_signin:
            print("\n  ⚠️  User is NOT signed in. Cannot test authenticated golden path.")
            print("  The browser session does not have a valid Clerk auth cookie.")
            await screenshot(ws, "05b_signin_redirect")
        else:
            # Try to find and interact with the text input
            print("\n  Looking for text input...")
            input_check = await send_cmd(ws, "Runtime.evaluate", {
                "expression": """
                    const inputs = document.querySelectorAll('textarea, input[type="text"]');
                    JSON.stringify(Array.from(inputs).map(i => ({tag: i.tagName, placeholder: i.placeholder, id: i.id, class: i.className.slice(0,50)})))
                """,
                "returnByValue": True
            })
            print(f"   Inputs found: {input_check.get('result', {}).get('value', '[]')}")
        
        print("\n=== Screenshots saved to:", SCREENSHOTS_DIR, "===")

if __name__ == "__main__":
    asyncio.run(main())
