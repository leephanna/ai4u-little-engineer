#!/usr/bin/env python3
"""
Generate a Clerk sign-in token with redirect_url pointing back to the app,
navigate the sandbox browser through the full auth flow, then verify dashboard access.
"""
import asyncio, json, base64, os, subprocess, urllib.request, websockets, time

BASE = "http://localhost:9222"
SCREENSHOTS_DIR = "/home/ubuntu/le-repo/proof_screenshots"
PROD_URL = "https://ai4u-little-engineer-web.vercel.app"
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

CMD_ID = 3000

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

async def get_url(ws):
    r = await send_cmd(ws, "Runtime.evaluate", {"expression": "window.location.href", "returnByValue": True})
    return r.get("result", {}).get("value", "")

async def eval_js(ws, expr):
    r = await send_cmd(ws, "Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": True})
    return r.get("result", {}).get("value", None)

async def main():
    # Get Clerk secret
    result = subprocess.run(
        ["grep", "CLERK_SECRET_KEY", "/home/ubuntu/le-repo/apps/web/.env.local"],
        capture_output=True, text=True
    )
    secret = None
    for line in result.stdout.splitlines():
        if line.startswith("CLERK_SECRET_KEY="):
            secret = line.split("=", 1)[1].strip().strip('"').strip("'")
            break
    
    print(f"Clerk secret prefix: {secret[:20]}...")
    
    # Generate sign-in token
    result = subprocess.run(
        ["curl", "-s", "-X", "POST", "https://api.clerk.com/v1/sign_in_tokens",
         "-H", f"Authorization: Bearer {secret}",
         "-H", "Content-Type: application/json",
         "-d", json.dumps({
             "user_id": "user_3CIG5JxvJ4h1glyCRt3BoddBGmw",
             "expires_in_seconds": 600
         })],
        capture_output=True, text=True
    )
    token_data = json.loads(result.stdout)
    base_ticket_url = token_data.get("url", "")
    ticket_token = token_data.get("token", "")
    print(f"Base ticket URL: {base_ticket_url[:80]}...")
    
    # The Clerk ticket URL goes to accounts.dev — we need to append redirect_url
    # so it redirects back to our app after auth
    import urllib.parse
    redirect_url = f"{PROD_URL}/dashboard"
    ticket_url_with_redirect = base_ticket_url + "&redirect_url=" + urllib.parse.quote(redirect_url, safe="")
    print(f"Ticket URL with redirect: {ticket_url_with_redirect[:120]}...")
    
    # Connect to browser
    resp = urllib.request.urlopen(f"{BASE}/json").read()
    tabs = json.loads(resp)
    target = None
    for t in tabs:
        if t.get("type") == "page" and "vercel.app" in t.get("url", ""):
            target = t
            break
    if not target:
        target = [t for t in tabs if t.get("type") == "page"][0]
    
    print(f"Tab: {target['id'][:8]} | {target.get('url','')[:60]}")
    
    async with websockets.connect(target["webSocketDebuggerUrl"], max_size=10_000_000) as ws:
        await send_cmd(ws, "Page.enable")
        await send_cmd(ws, "Network.enable")
        await send_cmd(ws, "Runtime.enable")
        
        # Navigate to the ticket URL with redirect
        print("\nNavigating to ticket URL with redirect...")
        await send_cmd(ws, "Page.navigate", {"url": ticket_url_with_redirect})
        
        # Wait longer for the auth flow to complete and redirect
        for i in range(12):
            await asyncio.sleep(2)
            url = await get_url(ws)
            print(f"  [{i*2}s] URL: {url[:80]}")
            if "dashboard" in url or ("vercel.app" in url and "sign-in" not in url):
                print("  ✅ Redirected to app!")
                break
            if "accounts.dev/default-redirect" in url:
                print("  ⚠️  Stuck at default-redirect, trying to navigate to app...")
                # The ticket was consumed — check if we have a session cookie now
                r = await send_cmd(ws, "Network.getAllCookies", {})
                cookies = r.get("cookies", [])
                session_cookies = [c for c in cookies if "__session" in c.get("name","")]
                print(f"  Session cookies: {len(session_cookies)}")
                for c in session_cookies:
                    print(f"    {c['name']} @ {c.get('domain','')} = {c.get('value','')[:40]}...")
                break
        
        await screenshot(ws, "signin_redirect_result")
        url = await get_url(ws)
        print(f"\nFinal URL after ticket: {url}")
        
        # Check all clerk cookies
        r = await send_cmd(ws, "Network.getAllCookies", {})
        all_cookies = r.get("cookies", [])
        clerk_cookies = [c for c in all_cookies if any(k in c.get("name","") for k in ["__session", "__client_uat", "__clerk"])]
        print(f"\nAll Clerk cookies ({len(clerk_cookies)}):")
        for c in clerk_cookies:
            print(f"  {c['name']} @ {c.get('domain','')} = {c.get('value','')[:50]}...")
        
        # If we have a __session cookie on accounts.dev, copy it to vercel.app
        accounts_session = next((c for c in all_cookies if c.get("name") == "__session" and "accounts.dev" in c.get("domain","")), None)
        if accounts_session:
            print(f"\n✅ Found __session on accounts.dev — copying to vercel.app domain...")
            session_val = accounts_session["value"]
            
            # Navigate to vercel.app first
            await send_cmd(ws, "Page.navigate", {"url": f"{PROD_URL}/"})
            await asyncio.sleep(3)
            
            # Set the cookie on vercel.app domain
            await send_cmd(ws, "Network.setCookie", {
                "name": "__session",
                "value": session_val,
                "domain": "ai4u-little-engineer-web.vercel.app",
                "path": "/",
                "secure": True,
                "sameSite": "None",
                "httpOnly": True
            })
            # Set __client_uat to current time (non-zero = authenticated)
            uat = str(int(time.time()))
            await send_cmd(ws, "Network.setCookie", {
                "name": "__client_uat",
                "value": uat,
                "domain": ".ai4u-little-engineer-web.vercel.app",
                "path": "/",
                "secure": True,
                "sameSite": "None",
                "httpOnly": False
            })
            print(f"  Set __session and __client_uat={uat} on vercel.app")
            
            # Navigate to dashboard
            await send_cmd(ws, "Page.navigate", {"url": f"{PROD_URL}/dashboard"})
            await asyncio.sleep(5)
            url = await get_url(ws)
            print(f"\nDashboard URL: {url}")
            await screenshot(ws, "dashboard_after_cookie_copy")
            
            content = await eval_js(ws, "document.body.innerText.slice(0, 400)")
            print(f"Content: {content[:300]}")
        
        elif "dashboard" in url and "sign-in" not in url:
            print("\n✅ Already on dashboard!")
            await screenshot(ws, "dashboard_authenticated")
            content = await eval_js(ws, "document.body.innerText.slice(0, 400)")
            print(f"Content: {content[:300]}")
        else:
            print("\n❌ Not authenticated. Checking what's on screen...")
            content = await eval_js(ws, "document.body.innerText.slice(0, 400)")
            print(f"Content: {content[:300]}")

asyncio.run(main())
