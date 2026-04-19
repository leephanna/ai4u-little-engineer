#!/usr/bin/env python3
"""
Find the authenticated Clerk session in any open tab and extract cookies.
Then inject those cookies into the target tab for the proof pass.
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

async def send_cmd(ws, method, params=None, timeout=15):
    cmd_id = int(time.time() * 1000) % 100000 + hash(method) % 1000
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
    raise TimeoutError(f"CDP command {method} timed out after {timeout}s")

async def screenshot(ws, name):
    result = await send_cmd(ws, "Page.captureScreenshot", {"format": "png", "quality": 85}, timeout=15)
    data = result.get("data", "")
    if not data:
        print(f"  ⚠️  No screenshot data for {name}")
        return None
    path = f"{SCREENSHOTS_DIR}/{name}.png"
    with open(path, "wb") as f:
        f.write(base64.b64decode(data))
    print(f"  📸 {path}")
    return path

async def get_url(ws):
    result = await send_cmd(ws, "Runtime.evaluate", {
        "expression": "window.location.href",
        "returnByValue": True
    })
    return result.get("result", {}).get("value", "")

async def get_cookies(ws):
    """Get all cookies for the vercel app domain."""
    result = await send_cmd(ws, "Network.getAllCookies", {}, timeout=10)
    cookies = result.get("cookies", [])
    vercel_cookies = [c for c in cookies if "vercel.app" in c.get("domain", "") or "clerk" in c.get("name", "").lower()]
    return vercel_cookies

async def navigate_and_wait(ws, url, wait=5):
    await send_cmd(ws, "Page.navigate", {"url": url})
    await asyncio.sleep(wait)
    return await get_url(ws)

async def main():
    # Get all tabs
    resp = urllib.request.urlopen(f"{BASE}/json").read()
    all_tabs = json.loads(resp)
    
    page_tabs = [t for t in all_tabs if t.get("type") == "page"]
    print(f"Total page tabs: {len(page_tabs)}")
    
    # Find tabs that might be authenticated (not about:blank, not sign-in)
    auth_tabs = []
    sign_in_tabs = []
    for t in page_tabs:
        url = t.get("url", "")
        if "vercel.app" in url and "sign-in" not in url and "about:blank" not in url:
            auth_tabs.append(t)
        elif "vercel.app" in url and "sign-in" in url:
            sign_in_tabs.append(t)
    
    print(f"Potentially authenticated tabs: {len(auth_tabs)}")
    for t in auth_tabs:
        print(f"  {t.get('id')[:8]} | {t.get('title')[:50]} | {t.get('url')[:80]}")
    
    print(f"Sign-in tabs: {len(sign_in_tabs)}")
    for t in sign_in_tabs:
        print(f"  {t.get('id')[:8]} | {t.get('url')[:80]}")
    
    # Try to get cookies from any vercel tab
    # Use the Network domain on the first available tab to get cookies
    target_tab = auth_tabs[0] if auth_tabs else (sign_in_tabs[0] if sign_in_tabs else page_tabs[-1])
    
    print(f"\nConnecting to tab: {target_tab.get('id')[:8]} | {target_tab.get('url', '')[:60]}")
    
    async with websockets.connect(target_tab["webSocketDebuggerUrl"], max_size=10_000_000) as ws:
        await send_cmd(ws, "Page.enable")
        await send_cmd(ws, "Network.enable")
        await send_cmd(ws, "Runtime.enable")
        
        current_url = await get_url(ws)
        print(f"Current URL: {current_url}")
        
        # Get cookies
        cookies = await get_cookies(ws)
        print(f"\nFound {len(cookies)} Clerk/Vercel cookies:")
        clerk_cookies = []
        for c in cookies:
            print(f"  {c.get('name')}: domain={c.get('domain')}, secure={c.get('secure')}, httpOnly={c.get('httpOnly')}")
            if any(k in c.get("name", "") for k in ["__session", "__client", "clerk", "__clerk"]):
                clerk_cookies.append(c)
        
        print(f"\nClerk session cookies: {len(clerk_cookies)}")
        for c in clerk_cookies:
            val = c.get("value", "")
            print(f"  {c.get('name')}: {val[:40]}...")
        
        if not clerk_cookies:
            print("\n⚠️  No Clerk session cookies found in this tab.")
            print("The user may not be signed in via this browser session.")
            
            # Try navigating to dashboard to see what happens
            print("\nAttempting to navigate to /dashboard to check auth state...")
            new_url = await navigate_and_wait(ws, f"{PROD_URL}/dashboard", wait=5)
            print(f"Result URL: {new_url}")
            await screenshot(ws, "auth_check_dashboard")
            
            # Try /invent
            new_url = await navigate_and_wait(ws, f"{PROD_URL}/invent", wait=5)
            print(f"/invent URL: {new_url}")
            await screenshot(ws, "auth_check_invent")
            
            # Check if there's a session token in localStorage
            ls_result = await send_cmd(ws, "Runtime.evaluate", {
                "expression": "JSON.stringify(Object.keys(localStorage).filter(k => k.includes('clerk') || k.includes('session')))",
                "returnByValue": True
            })
            print(f"LocalStorage clerk keys: {ls_result.get('result', {}).get('value', '[]')}")
            
        else:
            print("\n✅ Found Clerk session cookies! Proceeding with authenticated proof pass.")
            
            # Navigate to dashboard
            print("\nNavigating to /dashboard...")
            new_url = await navigate_and_wait(ws, f"{PROD_URL}/dashboard", wait=5)
            print(f"Dashboard URL: {new_url}")
            is_auth = "dashboard" in new_url
            print(f"Auth state: {'✅ AUTHENTICATED' if is_auth else '❌ REDIRECTED TO SIGN-IN'}")
            await screenshot(ws, "01_dashboard_baseline")
            
            if is_auth:
                # Get dashboard content
                content = await send_cmd(ws, "Runtime.evaluate", {
                    "expression": "document.body.innerText.slice(0, 2000)",
                    "returnByValue": True
                })
                print(f"\nDashboard content preview:\n{content.get('result', {}).get('value', '')[:500]}")

if __name__ == "__main__":
    asyncio.run(main())
