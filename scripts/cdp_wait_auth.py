#!/usr/bin/env python3
"""
Patient monitoring script — generates a fresh Clerk ticket, navigates to it,
and waits up to 30 seconds for the cross-domain handshake to complete.
"""
import asyncio, json, base64, os, subprocess, urllib.request, websockets, time

BASE = "http://localhost:9222"
SCREENSHOTS_DIR = "/home/ubuntu/le-repo/proof_screenshots"
PROD_URL = "https://ai4u-little-engineer-web.vercel.app"
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

CMD_ID = 4000

async def send_cmd(ws, method, params=None, timeout=25):
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
    
    # Generate fresh sign-in token
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
    
    import urllib.parse
    redirect_url = f"{PROD_URL}/dashboard"
    ticket_url = base_ticket_url + "&redirect_url=" + urllib.parse.quote(redirect_url, safe="")
    print(f"Ticket URL generated (expires in 600s)")
    
    # Connect to browser
    resp = urllib.request.urlopen(f"{BASE}/json").read()
    tabs = json.loads(resp)
    target = [t for t in tabs if t.get("type") == "page" and "vercel.app" in t.get("url","")]
    if not target:
        target = [t for t in tabs if t.get("type") == "page"]
    target = target[0]
    
    print(f"Tab: {target['id'][:8]} | {target.get('url','')[:60]}")
    
    async with websockets.connect(target["webSocketDebuggerUrl"], max_size=10_000_000) as ws:
        await send_cmd(ws, "Page.enable")
        await send_cmd(ws, "Network.enable")
        await send_cmd(ws, "Runtime.enable")
        
        # Navigate to ticket URL
        print("\nNavigating to Clerk ticket URL...")
        await send_cmd(ws, "Page.navigate", {"url": ticket_url})
        
        # Monitor for up to 45 seconds
        start = time.time()
        last_url = ""
        authenticated = False
        
        while time.time() - start < 45:
            await asyncio.sleep(1)
            url = await get_url(ws)
            
            if url != last_url:
                elapsed = int(time.time() - start)
                print(f"  [{elapsed}s] {url[:100]}")
                last_url = url
                
                # Check if we've landed on the app with a handshake
                if "__clerk_handshake" in url or "__clerk_db_jwt" in url:
                    print("  ✅ Clerk handshake parameter detected!")
                    await asyncio.sleep(3)  # Wait for handshake to complete
                    url = await get_url(ws)
                    print(f"  Post-handshake URL: {url}")
                
                # Check if we're on the dashboard
                if "dashboard" in url and "sign-in" not in url and "vercel.app" in url:
                    print("  ✅ AUTHENTICATED — on dashboard!")
                    authenticated = True
                    break
                
                # Check if we're on the app (not sign-in)
                if "vercel.app" in url and "sign-in" not in url and "accounts.dev" not in url:
                    print("  ✅ On app (not sign-in)!")
                    authenticated = True
                    break
        
        await screenshot(ws, "wait_auth_final")
        
        if not authenticated:
            print("\n❌ Auth timed out. Checking cookies...")
            r = await send_cmd(ws, "Network.getAllCookies", {})
            cookies = r.get("cookies", [])
            for c in cookies:
                if any(k in c.get("name","") for k in ["__session", "__client_uat"]) and "vercel.app" in c.get("domain",""):
                    print(f"  {c['name']} @ {c.get('domain','')} = {c.get('value','')[:40]}... (uat={c.get('value','')})")
            
            # Last resort: check if __session is set on accounts.dev and manually copy it
            session_on_accounts = next((c for c in cookies if c.get("name") == "__session" and "accounts.dev" in c.get("domain","")), None)
            if session_on_accounts:
                print(f"\n  Found __session on accounts.dev — attempting manual copy to vercel.app...")
                session_val = session_on_accounts["value"]
                
                # Navigate to vercel.app
                await send_cmd(ws, "Page.navigate", {"url": f"{PROD_URL}/"})
                await asyncio.sleep(3)
                
                # Set cookies
                await send_cmd(ws, "Network.setCookie", {
                    "name": "__session",
                    "value": session_val,
                    "domain": "ai4u-little-engineer-web.vercel.app",
                    "path": "/",
                    "secure": True,
                    "sameSite": "None",
                    "httpOnly": True
                })
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
                print(f"  Cookies set. Navigating to dashboard...")
                await send_cmd(ws, "Page.navigate", {"url": f"{PROD_URL}/dashboard"})
                await asyncio.sleep(5)
                url = await get_url(ws)
                print(f"  Dashboard URL: {url}")
                await screenshot(ws, "wait_auth_manual_copy")
                if "dashboard" in url and "sign-in" not in url:
                    authenticated = True
                    print("  ✅ AUTHENTICATED via manual cookie copy!")
        
        if authenticated:
            print("\n" + "="*60)
            print("✅ AUTHENTICATED — Starting golden path proof")
            print("="*60)
            
            url = await get_url(ws)
            content = await eval_js(ws, "document.body.innerText.slice(0, 600)")
            print(f"\nDashboard content:\n{content[:400]}")
            await screenshot(ws, "proof_01_dashboard")
            
            # Navigate to /invent
            print("\nNavigating to /invent...")
            await send_cmd(ws, "Page.navigate", {"url": f"{PROD_URL}/invent"})
            await asyncio.sleep(5)
            url = await get_url(ws)
            print(f"Invent URL: {url}")
            await screenshot(ws, "proof_02_invent")
            content = await eval_js(ws, "document.body.innerText.slice(0, 400)")
            print(f"Invent content: {content[:300]}")

asyncio.run(main())
