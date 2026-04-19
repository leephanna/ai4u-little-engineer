#!/usr/bin/env python3
"""Enter OTP code into the Clerk sign-in form and complete authentication."""
import asyncio, json, base64, urllib.request, websockets, time, os, sys

BASE = "http://localhost:9222"
SHOTS = "/home/ubuntu/le-repo/proof_screenshots"
os.makedirs(SHOTS, exist_ok=True)

OTP_CODE = sys.argv[1] if len(sys.argv) > 1 else "267424"

CMD_ID = 7000

async def send_cmd(ws, method, params=None, timeout=15):
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
        path = f"{SHOTS}/{name}.png"
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
    print(f"Entering OTP: {OTP_CODE}")
    
    resp = urllib.request.urlopen(f"{BASE}/json").read()
    tabs = json.loads(resp)
    target = None
    for t in tabs:
        url = t.get("url", "")
        if t.get("type") == "page" and "vercel.app" in url:
            target = t
            break
    if not target:
        target = [t for t in tabs if t.get("type") == "page"][0]
    
    print(f"Tab: {target['id'][:8]} | {target.get('url','')[:80]}")
    
    async with websockets.connect(target["webSocketDebuggerUrl"], max_size=10_000_000) as ws:
        await send_cmd(ws, "Page.enable")
        await send_cmd(ws, "Network.enable")
        await send_cmd(ws, "Runtime.enable")
        
        url = await get_url(ws)
        print(f"Current URL: {url}")
        
        await screenshot(ws, "otp_before")
        
        # Find OTP input fields
        result = await eval_js(ws, """
            const inputs = document.querySelectorAll('input');
            JSON.stringify(Array.from(inputs).map((el, i) => ({
                index: i,
                type: el.type,
                name: el.name,
                id: el.id,
                maxLength: el.maxLength,
                rect: JSON.stringify(el.getBoundingClientRect())
            })));
        """)
        print(f"All inputs: {result}")
        
        # Clerk OTP fields are typically individual digit inputs or a single input
        # Try clicking the first input field area and typing the full code
        # Based on the page structure, try to find and click the OTP input
        
        # Method 1: Try to find a single OTP input
        otp_input = await eval_js(ws, """
            const el = document.querySelector('input[autocomplete="one-time-code"], input[name="code"], input[id*="code"], input[id*="otp"]');
            if (el) {
                const rect = el.getBoundingClientRect();
                JSON.stringify({x: rect.x + rect.width/2, y: rect.y + rect.height/2, found: true});
            } else {
                // Try to find digit inputs (Clerk uses multiple single-digit inputs)
                const digitInputs = document.querySelectorAll('input[data-testid*="digit"], input[aria-label*="digit"], input[maxlength="1"]');
                if (digitInputs.length > 0) {
                    const rect = digitInputs[0].getBoundingClientRect();
                    JSON.stringify({x: rect.x + rect.width/2, y: rect.y + rect.height/2, found: true, count: digitInputs.length, type: 'digit'});
                } else {
                    JSON.stringify({found: false});
                }
            }
        """)
        print(f"OTP input location: {otp_input}")
        
        # Try clicking at the center of the OTP area (based on the screenshot, the code input is below the email)
        # The page shows "Check your email" with the email address, then a code input
        # Let's click at the approximate center of the input area
        
        # First, try using keyboard shortcut to focus and type
        # Click somewhere in the middle of the page where the OTP input should be
        await send_cmd(ws, "Input.dispatchMouseEvent", {
            "type": "mousePressed", "x": 637, "y": 450, "button": "left", "clickCount": 1
        })
        await send_cmd(ws, "Input.dispatchMouseEvent", {
            "type": "mouseReleased", "x": 637, "y": 450, "button": "left", "clickCount": 1
        })
        await asyncio.sleep(0.3)
        
        # Try Tab to focus the input
        await send_cmd(ws, "Input.dispatchKeyEvent", {"type": "keyDown", "key": "Tab", "code": "Tab"})
        await send_cmd(ws, "Input.dispatchKeyEvent", {"type": "keyUp", "key": "Tab", "code": "Tab"})
        await asyncio.sleep(0.3)
        
        # Type the OTP code
        print(f"Typing OTP: {OTP_CODE}")
        for char in OTP_CODE:
            await send_cmd(ws, "Input.dispatchKeyEvent", {
                "type": "keyDown",
                "key": char,
                "text": char,
                "code": f"Digit{char}",
                "windowsVirtualKeyCode": ord(char)
            })
            await send_cmd(ws, "Input.dispatchKeyEvent", {
                "type": "keyUp",
                "key": char,
                "text": char,
                "code": f"Digit{char}",
                "windowsVirtualKeyCode": ord(char)
            })
            await asyncio.sleep(0.1)
        
        await asyncio.sleep(1)
        await screenshot(ws, "otp_typed")
        
        # Check if auto-submitted or need to click Continue
        url = await get_url(ws)
        print(f"URL after typing: {url}")
        
        content = await eval_js(ws, "document.body.innerText.slice(0, 300)")
        print(f"Content: {content[:200]}")
        
        # Wait for redirect
        print("Waiting for authentication redirect...")
        for i in range(15):
            await asyncio.sleep(1)
            url = await get_url(ws)
            if "sign-in" not in url and "factor" not in url and "vercel.app" in url:
                print(f"✅ AUTHENTICATED! URL: {url}")
                break
            if i % 3 == 0:
                print(f"  [{i}s] {url[:80]}")
        
        await screenshot(ws, "otp_result")
        url = await get_url(ws)
        print(f"\nFinal URL: {url}")
        
        # Check cookies
        r = await send_cmd(ws, "Network.getAllCookies", {})
        cookies = r.get("cookies", [])
        vercel = [c for c in cookies if "vercel.app" in c.get("domain","")]
        print(f"\nVercel cookies ({len(vercel)}):")
        for c in vercel:
            print(f"  {c['name']} = {c.get('value','')[:50]}...")
        
        uat = next((c for c in vercel if c["name"] == "__client_uat"), None)
        session = next((c for c in vercel if c["name"] == "__session"), None)
        print(f"\n__client_uat: {uat['value'] if uat else 'NOT SET'}")
        print(f"__session: {'SET' if session else 'NOT SET'}")
        
        if uat and uat.get("value","0") != "0":
            print("\n✅ FULLY AUTHENTICATED!")
        else:
            print("\n❌ Still not authenticated")

asyncio.run(main())
