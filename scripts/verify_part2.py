#!/usr/bin/env python3
"""Part 2 verification: web search context + all 16 gallery items"""
import requests, json, time

BASE = "https://ai4u-little-engineer-web.vercel.app"
ADMIN_KEY = "891p-JU7zTvLfTAGO0we9S9LQd1wKjW33AJYILqQrhk"
HEADERS = {"x-admin-bypass-key": ADMIN_KEY, "Content-Type": "application/json"}

# ── Check deployment commit ───────────────────────────────────────────────────
r = requests.get(f"{BASE}/api/probe", timeout=15)
probe = r.json()
print(f"Deployed commit: {probe.get('commit', '?')}")
print(f"Probe status:    {probe.get('status', '?')}")
print()

# ── Part 2: web search context tests ─────────────────────────────────────────
print("=" * 60)
print("PART 2: Web Search Context Tests")
print("=" * 60)

web_search_tests = [
    ("Raspberry Pi 5 case", "enclosure"),
    ("GoPro Hero 12 mount bracket", "l_bracket"),
    ("Artemis II rocket display stand", "standoff_block"),
    ("Arduino Nano enclosure", "enclosure"),
]

for prompt, expected_family in web_search_tests:
    try:
        r = requests.post(
            f"{BASE}/api/invent",
            headers=HEADERS,
            json={"problem": prompt},
            timeout=30,
        )
        data = r.json()
        status = data.get("status", "unknown")
        family = data.get("family", data.get("routed_family", "none"))
        used_search = data.get("used_web_search", False)
        params = data.get("parameters", {})
        outcome = "✓" if family == expected_family or status in ("generating", "soft_match") else "?"
        print(f"{outcome} [{r.status_code}] {prompt!r}")
        print(f"    family: {family} (expected: {expected_family}) | outcome: {status}")
        print(f"    used_web_search: {used_search}")
        print(f"    parameters: {json.dumps(params)}")
    except Exception as e:
        print(f"✗ ERROR: {prompt!r} — {e}")
    print()

# ── Part 1: All 16 gallery items ─────────────────────────────────────────────
print("=" * 60)
print("PART 1: All 16 Gallery Items")
print("=" * 60)

gallery_items = [
    # Precision Parts
    ("spacer",         {"outer_diameter": 8, "inner_diameter": 4, "length": 20}),
    ("l_bracket",      {"leg_a": 40, "leg_b": 30, "thickness": 3, "width": 20}),
    ("adapter_bushing",{"outer_diameter": 12, "inner_diameter": 6, "length": 20}),
    ("standoff_block", {"base_width": 20, "height": 20, "hole_diameter": 3}),
    # Fun Prints
    ("cable_clip",     {"cable_od": 8, "wall_thickness": 2, "base_width": 15}),
    ("u_bracket",      {"pipe_od": 22, "wall_thickness": 3, "flange_width": 30, "flange_length": 20}),
    ("hole_plate",     {"length": 120, "width": 80, "thickness": 4, "hole_count": 9, "hole_diameter": 5}),
    ("solid_block",    {"length": 50, "width": 50, "height": 50}),
    # Showcase & Demos
    ("enclosure",      {"inner_length": 100, "inner_width": 60, "inner_height": 40, "wall_thickness": 2}),
    ("simple_jig",     {"length": 80, "width": 60, "thickness": 15}),
    ("flat_bracket",   {"length": 120, "width": 30, "thickness": 4}),
    ("enclosure",      {"inner_length": 86, "inner_width": 56, "inner_height": 30, "wall_thickness": 2}),
    # Gift & Decor
    ("hole_plate",     {"length": 40, "width": 25, "thickness": 3, "hole_count": 1, "hole_diameter": 4}),
    ("flat_bracket",   {"length": 150, "width": 40, "thickness": 5}),
    ("enclosure",      {"inner_length": 80, "inner_width": 60, "inner_height": 50, "wall_thickness": 2}),
    ("hole_plate",     {"length": 200, "width": 150, "thickness": 5, "hole_count": 16, "hole_diameter": 8}),
]

passed = 0
failed = 0
for i, (family, params) in enumerate(gallery_items, 1):
    try:
        r = requests.post(
            f"{BASE}/api/invent",
            headers=HEADERS,
            json={"problem": f"test gallery item {i}", "intake_family_candidate": family, "intake_dimensions": params},
            timeout=30,
        )
        data = r.json()
        if r.status_code == 200 and data.get("status") == "generating":
            print(f"  ✓ [{i:02d}] {family} {params} → job_id: {data.get('job_id','?')[:8]}...")
            passed += 1
        elif r.status_code == 422:
            reason = data.get("reason", "?")
            missing = data.get("missing_dimensions", [])
            print(f"  ✗ [{i:02d}] {family} {params}")
            print(f"       422 CLARIFY: {reason} | missing: {missing}")
            failed += 1
        else:
            print(f"  ? [{i:02d}] {family} → HTTP {r.status_code}: {str(data)[:80]}")
            failed += 1
    except Exception as e:
        print(f"  ✗ [{i:02d}] {family} — ERROR: {e}")
        failed += 1
    time.sleep(0.3)

print()
print(f"Gallery results: {passed}/16 passed, {failed} failed")
