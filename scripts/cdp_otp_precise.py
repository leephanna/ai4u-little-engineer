#!/usr/bin/env python3
"""Enter OTP code with precise coordinates derived from screenshot analysis."""
import asyncio, json, base64, urllib.request, websockets, time, os, sys

BASE = "http://localhost:9222"
SHOTS = "/home/ubuntu/le-repo/proof_screenshots"
os.makedirs(SHOTS, exist_ok=True)

OTP_CODE = sys.argv[1] if len(sys.argv) > 1 else "267424"

CMD_ID = 9000

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

async def click(ws, x, y):
    await send_cmd(ws, "Input.dispatchMouseEvent", {"type": "mousePressed", "x": x, "y": y, "button": "left", "clickCount": 1})
    await asyncio.sleep(0.05)
    await send_cmd(ws, "Input.dispatchMouseEvent", {"type": "mouseReleased", "x": x, "y": y, "button": "left", "clickCount": 1})
    await asyncio.sleep(0.15)

async def type_char(ws, char):
    code = f"Digit{char}" if char.isdigit() else f"Key{char.upper()}"
    vk = ord(char)
    await send_cmd(ws, "Input.dispatchKeyEvent", {
        "type": "keyDown", "key": char, "text": char,
        "code": code, "windowsVirtualKeyCode": vk, "nativeVirtualKeyCode": vk
    })
    await asyncio.sleep(0.08)
    await send_cmd(ws, "Input.dispatchKeyEvent", {
        "type": "keyUp", "key": char, "text": char,
        "code": code, "windowsVirtualKeyCode": vk, "nativeVirtualKeyCode": vk
    })
    await asyncio.sleep(0.12)

async def main():
    print(f"Entering OTP: {OTP_CODE}")
    
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
    
    async with websockets.connect(target["webSocketDebuggerUrl"], max_size=10_000_000) as ws:
        await send_cmd(ws, "Page.enable")
        await send_cmd(ws, "Network.enable")
        await send_cmd(ws, "Runtime.enable")
        
        url = await get_url(ws)
        print(f"Current URL: {url}")
        
        # From screenshot analysis: 
        # The 6 OTP boxes are at y≈481 (center)
        # Box centers from screenshot (1280px wide viewport):
        # Box 1: x≈516, Box 2: x≈564, Box 3: x≈612, Box 4: x≈660, Box 5: x≈708, Box 6: x≈756
        # The previous attempt showed digits landing in boxes 2-5 (offset by 1)
        # So actual box 1 center is at x≈468 (the leftmost box)
        # Let me use JS to get exact positions
        
        positions = await eval_js(ws, """
            // Try to find the OTP input container and get all child inputs
            const allInputs = Array.from(document.querySelectorAll('input'));
            const result = allInputs.map((el, i) => {
                const rect = el.getBoundingClientRect();
                return {
                    i, 
                    x: Math.round(rect.x + rect.width/2), 
                    y: Math.round(rect.y + rect.height/2),
                    w: Math.round(rect.width),
                    h: Math.round(rect.height),
                    left: Math.round(rect.left),
                    top: Math.round(rect.top),
                    maxLen: el.maxLength,
                    name: el.name,
                    id: el.id,
                    value: el.value
                };
            });
            JSON.stringify(result);
        """)
        print(f"All inputs with positions: {positions}")
        
        inputs_data = json.loads(positions) if positions else []
        
        # Clear all existing values first
        print("\nClearing existing values...")
        for inp in inputs_data:
            if inp.get('w', 0) < 70:  # Small inputs = digit boxes
                await click(ws, inp['x'], inp['y'])
                # Select all and delete
                await send_cmd(ws, "Input.dispatchKeyEvent", {"type": "keyDown", "key": "a", "code": "KeyA", "modifiers": 2})
                await send_cmd(ws, "Input.dispatchKeyEvent", {"type": "keyUp", "key": "a", "code": "KeyA", "modifiers": 2})
                await asyncio.sleep(0.05)
                await send_cmd(ws, "Input.dispatchKeyEvent", {"type": "keyDown", "key": "Backspace", "code": "Backspace"})
                await send_cmd(ws, "Input.dispatchKeyEvent", {"type": "keyUp", "key": "Backspace", "code": "Backspace"})
                await asyncio.sleep(0.05)
        
        # Now enter the OTP digits
        # Filter to only the small digit inputs (width < 70px)
        digit_inputs = [inp for inp in inputs_data if inp.get('w', 0) < 70 and inp.get('w', 0) > 15]
        print(f"\nDigit inputs found: {len(digit_inputs)}")
        for inp in digit_inputs:
            print(f"  Input {inp['i']}: x={inp['x']}, y={inp['y']}, w={inp['w']}, value='{inp.get('value','')}'")
        
        if len(digit_inputs) >= 6:
            print(f"\nEntering OTP digits into {len(digit_inputs)} boxes...")
            for i, digit in enumerate(OTP_CODE):
                if i < len(digit_inputs):
                    inp = digit_inputs[i]
                    print(f"  Box {i+1}: '{digit}' -> click({inp['x']}, {inp['y']})")
                    await click(ws, inp['x'], inp['y'])
                    await type_char(ws, digit)
                    await asyncio.sleep(0.1)
        else:
            # Use the first input and type all at once (some Clerk versions use a single hidden input)
            print(f"\nFallback: clicking first input and typing all digits...")
            if digit_inputs:
                inp = digit_inputs[0]
                await click(ws, inp['x'], inp['y'])
            else:
                # Click center of where boxes should be
                await click(ws, 637, 481)
            
            for digit in OTP_CODE:
                await type_char(ws, digit)
        
        await asyncio.sleep(0.5)
        await screenshot(ws, "otp_precise_typed")
        
        # Check values
        values = await eval_js(ws, """
            const inputs = Array.from(document.querySelectorAll('input'));
            JSON.stringify(inputs.map(el => ({name: el.name, value: el.value, id: el.id})));
        """)
        print(f"\nInput values after typing: {values}")
        
        # Check if auto-submitted
        url = await get_url(ws)
        print(f"URL after typing: {url}")
        
        if "factor" in url or "sign-in" in url:
            # Click Continue
            print("\nClicking Continue...")
            await click(ws, 637, 569)
            await asyncio.sleep(2)
        
        # Wait for redirect
        print("\nWaiting for authentication...")
        for i in range(20):
            await asyncio.sleep(1)
            url = await get_url(ws)
            if "vercel.app" in url and "sign-in" not in url and "factor" not in url:
                print(f"✅ AUTHENTICATED! URL: {url}")
                break
            if i % 3 == 0:
                print(f"  [{i}s] {url[:80]}")
        
        await screenshot(ws, "otp_precise_result")
        url = await get_url(ws)
        print(f"\nFinal URL: {url}")
        
        # Check cookies
        r = await send_cmd(ws, "Network.getAllCookies", {})
        cookies = r.get("cookies", [])
        vercel = [c for c in cookies if "vercel.app" in c.get("domain","")]
        uat = next((c for c in vercel if c["name"] == "__client_uat"), None)
        session = next((c for c in vercel if c["name"] == "__session"), None)
        print(f"__client_uat: {uat['value'] if uat else 'NOT SET'}")
        print(f"__session: {'SET' if session else 'NOT SET'}")
        
        if uat and uat.get("value","0") != "0":
            print("\n✅ FULLY AUTHENTICATED!")
            content = await eval_js(ws, "document.body.innerText.slice(0, 500)")
            print(f"Page content:\n{content[:400]}")
        else:
            print("\n❌ Still not authenticated")

asyncio.run(main())
