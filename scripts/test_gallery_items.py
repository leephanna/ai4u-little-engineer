#!/usr/bin/env python3
"""Test all 16 gallery locked specs against the live /api/invent endpoint."""
import requests
import json
import os

BASE = "https://ai4u-little-engineer-web.vercel.app"
ADMIN_KEY = "891p-JU7zTvLfTAGO0we9S9LQd1wKjW33AJYILqQrhk"

GALLERY_ITEMS = [
    # Precision Parts
    {"id": "spacer-m5", "name": "M5 Bolt Spacer", "family": "spacer",
     "params": {"outer_diameter": 10, "inner_diameter": 5.5, "length": 20}},
    {"id": "l-bracket-corner", "name": "Corner L-Bracket", "family": "l_bracket",
     "params": {"leg_a": 50, "leg_b": 50, "thickness": 3, "width": 20}},
    {"id": "bushing-shaft", "name": "Shaft Adapter Bushing", "family": "adapter_bushing",
     "params": {"outer_diameter": 20, "inner_diameter": 10, "length": 20}},
    {"id": "standoff-m3", "name": "M3 PCB Standoff", "family": "standoff_block",
     "params": {"base_width": 15, "height": 20, "hole_diameter": 3.2}},
    # Fun Prints
    {"id": "cable-clip-8mm", "name": "Cable Management Clip", "family": "cable_clip",
     "params": {"cable_od": 8, "wall_thickness": 2, "base_width": 20}},
    {"id": "pipe-saddle-25mm", "name": "Pipe Saddle Bracket", "family": "u_bracket",
     "params": {"pipe_od": 25, "wall_thickness": 2.5, "flange_width": 15, "flange_length": 20}},
    {"id": "planter-drain", "name": "Planter Drainage Insert", "family": "hole_plate",
     "params": {"length": 120, "width": 80, "thickness": 3, "hole_count": 12, "hole_diameter": 8}},
    {"id": "display-block", "name": "Display Stand Block", "family": "solid_block",
     "params": {"length": 80, "width": 60, "height": 40}},
    # Showcase & Demos
    {"id": "enclosure-arduino", "name": "Arduino Nano Enclosure", "family": "enclosure",
     "params": {"inner_length": 50, "inner_width": 30, "inner_height": 20, "wall_thickness": 2}},
    {"id": "drill-jig", "name": "Drill Alignment Jig", "family": "simple_jig",
     "params": {"length": 80, "width": 60, "thickness": 15}},
    {"id": "flat-bracket-mount", "name": "Flat Mounting Bracket", "family": "flat_bracket",
     "params": {"length": 120, "width": 30, "thickness": 4, "hole_count": 2, "hole_diameter": 4}},
    {"id": "enclosure-rpi", "name": "Raspberry Pi Enclosure", "family": "enclosure",
     "params": {"inner_length": 90, "inner_width": 60, "inner_height": 30, "wall_thickness": 2}},
    # Gift & Decor
    {"id": "keychain-tag", "name": "Keychain Tag", "family": "hole_plate",
     "params": {"length": 40, "width": 25, "thickness": 3, "hole_count": 1, "hole_diameter": 5}},
    {"id": "nameplate-base", "name": "Desk Nameplate Base", "family": "flat_bracket",
     "params": {"length": 150, "width": 40, "thickness": 5, "hole_count": 0, "hole_diameter": 3}},
    {"id": "gift-box", "name": "Small Gift Box", "family": "enclosure",
     "params": {"inner_length": 80, "inner_width": 60, "inner_height": 40, "wall_thickness": 2}},
    {"id": "wall-plate", "name": "Wall Mounting Plate", "family": "hole_plate",
     "params": {"length": 100, "width": 60, "thickness": 4, "hole_count": 4, "hole_diameter": 5}},
]

print(f"Testing {len(GALLERY_ITEMS)} gallery items...\n")
print(f"{'#':<3} {'Name':<30} {'Expected':<18} {'Status':<12} {'Result'}")
print("-" * 90)

pass_count = 0
fail_count = 0
results = []

for i, item in enumerate(GALLERY_ITEMS, 1):
    payload = {
        "problem": f"Gallery preset: {item['name']}",
        "intake_family_candidate": item["family"],
        "intake_dimensions": item["params"],
    }
    try:
        r = requests.post(
            f"{BASE}/api/invent",
            json=payload,
            headers={"x-admin-bypass-key": ADMIN_KEY},
            timeout=30,
        )
        data = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        status_code = r.status_code

        if status_code == 200:
            result_status = data.get("status", "unknown")
            job_id = data.get("job_id", "")
            if result_status in ("generating", "direct_match"):
                verdict = "✓ PASS"
                pass_count += 1
                detail = f"job_id={job_id[:8]}..."
            else:
                verdict = f"✗ FAIL ({result_status})"
                fail_count += 1
                detail = str(data)[:50]
        elif status_code == 422:
            truth_label = data.get("truth_label", "?")
            missing = data.get("missing_dimensions", [])
            verdict = f"✗ 422 {truth_label}"
            fail_count += 1
            detail = f"missing={missing}"
        else:
            verdict = f"✗ HTTP {status_code}"
            fail_count += 1
            detail = str(data)[:50]

        print(f"{i:<3} {item['name']:<30} {item['family']:<18} {verdict:<20} {detail}")
        results.append({
            "id": item["id"],
            "name": item["name"],
            "family": item["family"],
            "status_code": status_code,
            "verdict": verdict,
            "detail": detail,
        })
    except Exception as e:
        verdict = f"✗ ERROR: {e}"
        fail_count += 1
        print(f"{i:<3} {item['name']:<30} {item['family']:<18} {verdict}")
        results.append({"id": item["id"], "name": item["name"], "family": item["family"], "verdict": verdict})

print("-" * 90)
print(f"\nResults: {pass_count}/{len(GALLERY_ITEMS)} passed, {fail_count} failed")

with open("/tmp/gallery_test_results.json", "w") as f:
    json.dump(results, f, indent=2)
print(f"Results saved to /tmp/gallery_test_results.json")
