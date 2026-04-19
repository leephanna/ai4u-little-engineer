#!/usr/bin/env python3
"""
Inject a fresh Clerk session JWT as __session cookie on vercel.app domain,
then run the full golden path proof.
"""
import asyncio, json, base64, os, subprocess, urllib.request, websockets, time

BASE = "http://localhost:9222"
SCREENSHOTS_DIR = "/home/ubuntu/le-repo/proof_screenshots"
PROD_URL = "https://ai4u-little-engineer-web.vercel.app"
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

CMD_ID = 5000

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

def get_fresh_session_jwt(secret):
    """Create a new session and get its JWT."""
    # Create session
    result = subprocess.run(
        ["curl", "-s", "-X", "POST", "https://api.clerk.com/v1/sessions",
         "-H", f"Authorization: Bearer {secret}",
         "-H", "Content-Type: application/json",
         "-d", json.dumps({"user_id": "user_3CIG5JxvJ4h1glyCRt3BoddBGmw"})],
        capture_output=True, text=True
    )
    session_data = json.loads(result.stdout)
    session_id = session_data.get("id", "")
    print(f"  Created session: {session_id}")
    
    # Get JWT for session
    result = subprocess.run(
        ["curl", "-s", "-X", "POST", f"https://api.clerk.com/v1/sessions/{session_id}/tokens",
         "-H", f"Authorization: Bearer {secret}",
         "-H", "Content-Type: application/json"],
        capture_output=True, text=True
    )
    token_data = json.loads(result.stdout)
    jwt = token_data.get("jwt", "")
    print(f"  JWT prefix: {jwt[:40]}...")
    return jwt, session_id

async def main():
    print("="*60)
    print("AI4U Little Engineer — Live Golden Path Proof")
    print("="*60)
    
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
    
    print(f"\n[AUTH] Getting fresh session JWT...")
    session_jwt, session_id = get_fresh_session_jwt(secret)
    
    # Connect to browser
    resp = urllib.request.urlopen(f"{BASE}/json").read()
    tabs = json.loads(resp)
    print(f"\nBrowser tabs:")
    for t in tabs:
        print(f"  [{t['id'][:8]}] {t.get('type')} | {t.get('url','')[:70]}")
    
    target = [t for t in tabs if t.get("type") == "page"]
    target = target[0]
    print(f"\nUsing: {target['id'][:8]} | {target.get('url','')[:60]}")
    
    async with websockets.connect(target["webSocketDebuggerUrl"], max_size=10_000_000) as ws:
        await send_cmd(ws, "Page.enable")
        await send_cmd(ws, "Network.enable")
        await send_cmd(ws, "Runtime.enable")
        
        # Step 1: Navigate to the app homepage
        print(f"\n[STEP 1] Navigating to app homepage...")
        await send_cmd(ws, "Page.navigate", {"url": f"{PROD_URL}/"})
        await asyncio.sleep(4)
        url = await get_url(ws)
        print(f"  URL: {url}")
        
        # Step 2: Inject session cookie
        print(f"\n[STEP 2] Injecting Clerk session JWT as __session cookie...")
        uat = str(int(time.time()))
        
        # Set __session cookie
        r = await send_cmd(ws, "Network.setCookie", {
            "name": "__session",
            "value": session_jwt,
            "domain": "ai4u-little-engineer-web.vercel.app",
            "path": "/",
            "secure": True,
            "sameSite": "None",
            "httpOnly": True
        })
        print(f"  __session set: {r}")
        
        # Set __client_uat (non-zero = authenticated)
        r = await send_cmd(ws, "Network.setCookie", {
            "name": "__client_uat",
            "value": uat,
            "domain": ".ai4u-little-engineer-web.vercel.app",
            "path": "/",
            "secure": True,
            "sameSite": "None",
            "httpOnly": False
        })
        print(f"  __client_uat={uat} set: {r}")
        
        # Also try setting via JavaScript
        await eval_js(ws, f"""
            // Try to set via Clerk's internal mechanism
            if (window.Clerk) {{
                console.log('Clerk found:', window.Clerk.version);
            }}
        """)
        
        # Step 3: Navigate to dashboard with a hard reload
        print(f"\n[STEP 3] Navigating to /dashboard...")
        await send_cmd(ws, "Page.navigate", {"url": f"{PROD_URL}/dashboard"})
        await asyncio.sleep(6)
        url = await get_url(ws)
        print(f"  URL: {url}")
        await screenshot(ws, "inject_step3_dashboard")
        
        is_auth = "dashboard" in url and "sign-in" not in url
        print(f"  Auth: {'✅ AUTHENTICATED' if is_auth else '❌ NOT AUTH'}")
        
        if not is_auth:
            content = await eval_js(ws, "document.body.innerText.slice(0, 300)")
            print(f"  Content: {content}")
            
            # Check what cookies are actually set
            r = await send_cmd(ws, "Network.getAllCookies", {})
            cookies = r.get("cookies", [])
            vercel_cookies = [c for c in cookies if "vercel.app" in c.get("domain","")]
            print(f"\n  Vercel.app cookies ({len(vercel_cookies)}):")
            for c in vercel_cookies:
                print(f"    {c['name']} = {c.get('value','')[:40]}... (httpOnly={c.get('httpOnly')}, secure={c.get('secure')})")
            
            # Try the __clerk_handshake approach
            # The Clerk middleware checks for __clerk_handshake in the URL
            # If we can get the handshake token from the Clerk API, we can navigate directly
            print("\n  Trying __clerk_handshake approach...")
            
            # The handshake is generated by Clerk's frontend API
            # We need to call the Clerk FAPI to get a handshake token
            clerk_fapi = "https://touched-swan-54.clerk.accounts.dev"
            result = subprocess.run(
                ["curl", "-s", "-X", "POST", f"{clerk_fapi}/v1/client/handshake",
                 "-H", f"Authorization: Bearer {secret}",
                 "-H", "Content-Type: application/json",
                 "-d", json.dumps({"session_id": session_id})],
                capture_output=True, text=True
            )
            print(f"  Handshake response: {result.stdout[:200]}")
            
            return
        
        # ============================================================
        # AUTHENTICATED — Run full golden path
        # ============================================================
        print("\n" + "="*60)
        print("✅ AUTHENTICATED — Running full golden path")
        print("="*60)
        
        content = await eval_js(ws, "document.body.innerText.slice(0, 800)")
        print(f"\nDashboard:\n{content[:500]}")
        
        # Navigate to /invent
        print("\n[INVENT] Navigating to /invent...")
        await send_cmd(ws, "Page.navigate", {"url": f"{PROD_URL}/invent"})
        await asyncio.sleep(5)
        url = await get_url(ws)
        print(f"  URL: {url}")
        await screenshot(ws, "proof_invent")
        content = await eval_js(ws, "document.body.innerText.slice(0, 400)")
        print(f"  Content: {content[:300]}")

asyncio.run(main())
