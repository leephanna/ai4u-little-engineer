#!/usr/bin/env python3
"""Click each OTP digit box and type digits one at a time."""
import asyncio, json, base64, urllib.request, websockets, time, os, sys

BASE = "http://localhost:9222"
SHOTS = "/home/ubuntu/le-repo/proof_screenshots"
os.makedirs(SHOTS, exist_ok=True)

OTP_CODE = sys.argv[1] if len(sys.argv) > 1 else "267424"

CMD_ID = 8000

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
    await send_cmd(ws, "Input.dispatchMouseEvent", {"type": "mouseReleased", "x": x, "y": y, "button": "left", "clickCount": 1})
    await asyncio.sleep(0.15)

async def type_char(ws, char):
    code = f"Digit{char}" if char.isdigit() else f"Key{char.upper()}"
    vk = ord(char)
    await send_cmd(ws, "Input.dispatchKeyEvent", {"type": "keyDown", "key": char, "text": char, "code": code, "windowsVirtualKeyCode": vk, "nativeVirtualKeyCode": vk})
    await asyncio.sleep(0.05)
    await send_cmd(ws, "Input.dispatchKeyEvent", {"type": "keyUp", "key": char, "text": char, "code": code, "windowsVirtualKeyCode": vk, "nativeVirtualKeyCode": vk})
    await asyncio.sleep(0.1)

async def main():
    print(f"Entering OTP digits: {OTP_CODE}")
    
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
        
        # Get the exact positions of the OTP digit inputs via JS
        positions = await eval_js(ws, """
            // Try multiple selectors for Clerk OTP inputs
            let inputs = document.querySelectorAll('input[data-testid*="digit"]');
            if (inputs.length === 0) inputs = document.querySelectorAll('input[maxlength="1"]');
            if (inputs.length === 0) inputs = document.querySelectorAll('input[aria-label*="digit"]');
            if (inputs.length === 0) {
                // Try all inputs and filter by size/position
                const allInputs = document.querySelectorAll('input');
                inputs = Array.from(allInputs).filter(el => {
                    const rect = el.getBoundingClientRect();
                    return rect.width < 60 && rect.width > 20 && rect.height > 20;
                });
            }
            JSON.stringify(Array.from(inputs).map((el, i) => {
                const rect = el.getBoundingClientRect();
                return {
                    i, 
                    x: Math.round(rect.x + rect.width/2), 
                    y: Math.round(rect.y + rect.height/2),
                    w: Math.round(rect.width),
                    h: Math.round(rect.height),
                    maxLen: el.maxLength,
                    name: el.name,
                    id: el.id
                };
            }));
        """)
        print(f"OTP inputs: {positions}")
        
        inputs_data = json.loads(positions) if positions else []
        
        if len(inputs_data) >= 6:
            print(f"\nFound {len(inputs_data)} digit inputs. Clicking each one...")
            for i, digit in enumerate(OTP_CODE):
                if i < len(inputs_data):
                    inp = inputs_data[i]
                    print(f"  Digit {i+1}: '{digit}' at ({inp['x']}, {inp['y']})")
                    await click(ws, inp['x'], inp['y'])
                    await type_char(ws, digit)
        else:
            # Fallback: click the first input and type all digits
            # The 6 boxes appear to be at y≈481, spaced ~48px apart starting at x≈517
            # From screenshot: boxes at approximately x=517,565,613,661,709,757 y=481
            print(f"\nUsing coordinate fallback (found {len(inputs_data)} inputs)...")
            box_x_positions = [517, 565, 613, 661, 709, 757]
            box_y = 481
            
            for i, digit in enumerate(OTP_CODE):
                x = box_x_positions[i]
                print(f"  Digit {i+1}: '{digit}' at ({x}, {box_y})")
                await click(ws, x, box_y)
                await type_char(ws, digit)
        
        await asyncio.sleep(0.5)
        await screenshot(ws, "otp_digits_typed")
        
        # Check if auto-submitted
        url = await get_url(ws)
        print(f"\nURL after typing digits: {url}")
        
        if "factor" in url or "sign-in" in url:
            # Need to click Continue
            print("Clicking Continue button...")
            await click(ws, 637, 569)
            await asyncio.sleep(3)
        
        # Wait for redirect
        print("Waiting for authentication...")
        for i in range(20):
            await asyncio.sleep(1)
            url = await get_url(ws)
            if "vercel.app" in url and "sign-in" not in url and "factor" not in url:
                print(f"✅ AUTHENTICATED! URL: {url}")
                break
            if i % 3 == 0:
                print(f"  [{i}s] {url[:80]}")
        
        await screenshot(ws, "otp_final_result")
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
            content = await eval_js(ws, "document.body.innerText.slice(0, 300)")
            print(f"Content: {content[:200]}")

asyncio.run(main())
