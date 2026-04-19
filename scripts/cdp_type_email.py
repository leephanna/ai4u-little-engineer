#!/usr/bin/env python3
"""Type email into the Clerk sign-in form and click Continue."""
import asyncio, json, base64, urllib.request, websockets, time, os

BASE = "http://localhost:9222"
SHOTS = "/home/ubuntu/le-repo/proof_screenshots"
os.makedirs(SHOTS, exist_ok=True)

CMD_ID = 6000

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
    resp = urllib.request.urlopen(f"{BASE}/json").read()
    tabs = json.loads(resp)
    
    # Find the sign-in tab
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
        
        # Navigate to sign-in if not already there
        if "sign-in" not in url:
            await send_cmd(ws, "Page.navigate", {"url": "https://ai4u-little-engineer-web.vercel.app/sign-in"})
            await asyncio.sleep(4)
        
        await screenshot(ws, "signin_before_email")
        
        # Find the email input using DOM query
        result = await eval_js(ws, """
            const inputs = document.querySelectorAll('input[type="email"], input[name="identifier"], input[placeholder*="email" i], input[autocomplete*="email"]');
            JSON.stringify(Array.from(inputs).map((el, i) => ({
                index: i,
                type: el.type,
                name: el.name,
                placeholder: el.placeholder,
                id: el.id,
                rect: JSON.stringify(el.getBoundingClientRect())
            })));
        """)
        print(f"Email inputs found: {result}")
        
        # Click on the email input using coordinates from the screenshot
        # The email input appears to be centered at roughly x=637, y=568 based on screenshot
        # Use CDP Input.dispatchMouseEvent to click
        await send_cmd(ws, "Input.dispatchMouseEvent", {
            "type": "mousePressed",
            "x": 637,
            "y": 568,
            "button": "left",
            "clickCount": 1
        })
        await send_cmd(ws, "Input.dispatchMouseEvent", {
            "type": "mouseReleased",
            "x": 637,
            "y": 568,
            "button": "left",
            "clickCount": 1
        })
        await asyncio.sleep(0.5)
        
        # Type the email
        email = "leehanna8@gmail.com"
        print(f"\nTyping email: {email}")
        for char in email:
            await send_cmd(ws, "Input.dispatchKeyEvent", {
                "type": "keyDown",
                "text": char
            })
            await send_cmd(ws, "Input.dispatchKeyEvent", {
                "type": "keyUp",
                "text": char
            })
            await asyncio.sleep(0.02)
        
        await asyncio.sleep(0.5)
        await screenshot(ws, "signin_email_typed")
        
        # Check what's in the input
        result = await eval_js(ws, """
            const inputs = document.querySelectorAll('input');
            JSON.stringify(Array.from(inputs).map(el => ({name: el.name, value: el.value, type: el.type})));
        """)
        print(f"Input values: {result}")
        
        # Click Continue button
        print("\nClicking Continue button...")
        # The Continue button is at approximately x=637, y=629
        await send_cmd(ws, "Input.dispatchMouseEvent", {
            "type": "mousePressed",
            "x": 637,
            "y": 629,
            "button": "left",
            "clickCount": 1
        })
        await send_cmd(ws, "Input.dispatchMouseEvent", {
            "type": "mouseReleased",
            "x": 637,
            "y": 629,
            "button": "left",
            "clickCount": 1
        })
        
        await asyncio.sleep(4)
        await screenshot(ws, "signin_after_continue")
        
        url = await get_url(ws)
        print(f"\nURL after Continue: {url}")
        content = await eval_js(ws, "document.body.innerText.slice(0, 500)")
        print(f"Content: {content[:400]}")

asyncio.run(main())
