#!/usr/bin/env python3
"""
eval-live.py — Little Engineer Live Eval Gate
──────────────────────────────────────────────
Runs the hardened 10-case eval suite (v2.1) against the live NLU system.
All test families align to the production capability_registry:
  spacer, l_bracket, flat_bracket, u_bracket, hole_plate,
  enclosure, standoff_block, adapter_bushing, cable_clip, simple_jig

Promotion criteria:
  • ≥ 8/10 test cases pass
  • No hallucinated unsupported families

Exit code 0 = GO (≥ 8/10 pass)
Exit code 1 = NO-GO (< 8/10 pass)

Usage:
  python3 scripts/eval-live.py
  OPENAI_API_KEY=sk-... python3 scripts/eval-live.py
"""

import json
import os
import sys
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

try:
    from openai import OpenAI
except ImportError:
    print("ERROR: openai package not installed. Run: pip install openai")
    sys.exit(1)

# ── Production families (must match capability_registry) ─────────────────────
PRODUCTION_FAMILIES = {
    "spacer", "l_bracket", "flat_bracket", "u_bracket", "hole_plate",
    "enclosure", "standoff_block", "adapter_bushing", "cable_clip", "simple_jig",
}

# ── NLU system prompt (production v1.0) ──────────────────────────────────────
NLU_SYSTEM_PROMPT = """You are the NLU (Natural Language Understanding) module for Little Engineer,
a voice-to-CAD system for machinists. Your job is to parse user requests and extract:
1. intent: one of "design_part", "clarify", "confirm", "unknown"
2. family: the part family (e.g. "spacer", "l_bracket") or null if unclear/unsupported
3. dimensions: extracted numeric dimensions as a key-value object
4. missing_fields: list of required dimensions not yet provided
5. confidence: float 0.0-1.0

Supported part families (ONLY these — do not hallucinate others):
  spacer, l_bracket, flat_bracket, u_bracket, hole_plate,
  enclosure, standoff_block, adapter_bushing, cable_clip, simple_jig

If the user requests a part family not in the supported list, set intent="clarify",
family=null, and explain in a clarification_message field.

Always respond with valid JSON only."""

# ── 10-case eval suite (v2.1 — production families only) ─────────────────────
EVAL_CASES = [
    # tc-01: Basic spacer — all dims present
    {
        "id": "tc-01",
        "description": "Basic spacer with all dims",
        "transcript": "I need a spacer that is 5mm tall, 20mm outer diameter, 10mm inner diameter",
        "expected_intent": "design_part",
        "expected_family": "spacer",
        "expected_dims": {"height": 5, "outer_diameter": 20, "inner_diameter": 10},
        "expected_missing": [],
    },
    # tc-02: L-bracket — all dims present
    {
        "id": "tc-02",
        "description": "L-bracket with all dims",
        "transcript": "Create an L-bracket, 50mm wide, 40mm tall, 3mm thick",
        "expected_intent": "design_part",
        "expected_family": "l_bracket",
        "expected_dims": {"width": 50, "height": 40, "thickness": 3},
        "expected_missing": [],
    },
    # tc-03: Ambiguous — should clarify
    {
        "id": "tc-03",
        "description": "Ambiguous request needing clarification",
        "transcript": "I want a round thing for my printer",
        "expected_intent": "clarify",
        "expected_family": None,
        "expected_dims": {},
        "expected_missing": [],
    },
    # tc-04: Flat bracket — all dims
    {
        "id": "tc-04",
        "description": "Flat bracket with all dims",
        "transcript": "Make a flat bracket 80mm long, 30mm wide, 3mm thick",
        "expected_intent": "design_part",
        "expected_family": "flat_bracket",
        "expected_dims": {"length": 80, "width": 30, "thickness": 3},
        "expected_missing": [],
    },
    # tc-05: U-bracket — partial dims (should flag missing)
    {
        "id": "tc-05",
        "description": "U-bracket with partial dims",
        "transcript": "I need a U-bracket, 60mm wide",
        "expected_intent": "design_part",
        "expected_family": "u_bracket",
        "expected_dims": {"width": 60},
        "expected_missing": ["height", "thickness"],
    },
    # tc-06: Hole plate — all dims
    {
        "id": "tc-06",
        "description": "Hole plate with all dims",
        "transcript": "Make a hole plate 100mm by 60mm, 4mm thick, with 8mm holes",
        "expected_intent": "design_part",
        "expected_family": "hole_plate",
        "expected_dims": {"length": 100, "width": 60, "thickness": 4},
        "expected_missing": [],
    },
    # tc-07: Unsupported family — must NOT hallucinate
    {
        "id": "tc-07",
        "description": "Unsupported family — must clarify, not hallucinate",
        "transcript": "I need a turbine blade for a jet engine, 200mm span",
        "expected_intent": "clarify",
        "expected_family": None,
        "expected_dims": {},
        "expected_missing": [],
        "must_not_hallucinate": True,
    },
    # tc-08: Standoff block — all dims
    {
        "id": "tc-08",
        "description": "Standoff block with all dims",
        "transcript": "Create a standoff block 20mm tall, 15mm base, with a 4mm hole",
        "expected_intent": "design_part",
        "expected_family": "standoff_block",
        "expected_dims": {"height": 20, "base": 15},
        "expected_missing": [],
    },
    # tc-09: Cable clip — all dims
    {
        "id": "tc-09",
        "description": "Cable clip with all dims",
        "transcript": "Make a cable clip for a 6mm cable, 3mm wall, 20mm long",
        "expected_intent": "design_part",
        "expected_family": "cable_clip",
        "expected_dims": {"cable_diameter": 6, "wall_thickness": 3, "length": 20},
        "expected_missing": [],
    },
    # tc-10: Simple jig — all dims
    {
        "id": "tc-10",
        "description": "Simple jig with all dims",
        "transcript": "I need a simple drilling jig, 80mm long, 50mm wide, 4mm thick",
        "expected_intent": "design_part",
        "expected_family": "simple_jig",
        "expected_dims": {"length": 80, "width": 50, "thickness": 4},
        "expected_missing": [],
    },
]

PASS_THRESHOLD = 8  # ≥ 8/10 required for GO


def score_case(tc: Dict, result: Dict) -> Dict[str, Any]:
    """Score a single test case. Returns {passed, score, notes}."""
    notes = []
    score = 0
    max_score = 4

    # 1. Intent match
    if result.get("intent") == tc["expected_intent"]:
        score += 1
    else:
        notes.append(f"intent: expected={tc['expected_intent']!r}, got={result.get('intent')!r}")

    # 2. Family match
    expected_fam = tc["expected_family"]
    actual_fam = result.get("family")
    if expected_fam is None:
        if actual_fam is None or actual_fam not in PRODUCTION_FAMILIES:
            score += 1
            if tc.get("must_not_hallucinate") and actual_fam in PRODUCTION_FAMILIES:
                notes.append(f"HALLUCINATION: got family={actual_fam!r} for unsupported request")
                score -= 1
        else:
            if tc.get("must_not_hallucinate"):
                notes.append(f"HALLUCINATION: got family={actual_fam!r} for unsupported request")
            else:
                score += 1  # acceptable
    else:
        if actual_fam == expected_fam:
            score += 1
        else:
            notes.append(f"family: expected={expected_fam!r}, got={actual_fam!r}")

    # 3. Key dimensions extracted
    expected_dims = tc.get("expected_dims", {})
    actual_dims = result.get("dimensions", {}) or {}
    if not expected_dims:
        score += 1
    else:
        present = [k for k in expected_dims if actual_dims.get(k) is not None]
        if len(present) == len(expected_dims):
            score += 1
        else:
            missing = [k for k in expected_dims if actual_dims.get(k) is None]
            notes.append(f"dims missing: {missing}")

    # 4. Confidence >= 0.5 (basic sanity, only for design_part)
    confidence = float(result.get("confidence", 0))
    if result.get("intent") == "clarify" or confidence >= 0.5:
        score += 1
    else:
        notes.append(f"confidence too low: {confidence:.2f}")

    return {
        "passed": score == max_score and not any("HALLUCINATION" in n for n in notes),
        "score": score,
        "max_score": max_score,
        "notes": notes,
    }


def run_eval() -> int:
    """Run the full eval suite. Returns exit code (0=GO, 1=NO-GO)."""
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("ERROR: OPENAI_API_KEY not set")
        return 1

    client = OpenAI(api_key=api_key)

    print("═" * 72)
    print("  Little Engineer — Live Eval Gate (v2.1)")
    print(f"  {datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}")
    print(f"  Model: gpt-4.1-mini | Cases: {len(EVAL_CASES)} | Threshold: {PASS_THRESHOLD}/{len(EVAL_CASES)}")
    print("═" * 72)

    results = []
    pass_count = 0
    total_latency_ms = 0

    for tc in EVAL_CASES:
        print(f"\n  [{tc['id']}] {tc['description']}")
        print(f"  Transcript: {tc['transcript']!r}")

        t0 = time.time()
        llm_result: Dict = {}
        try:
            completion = client.chat.completions.create(
                model="gpt-4.1-mini",
                messages=[
                    {"role": "system", "content": NLU_SYSTEM_PROMPT},
                    {"role": "user", "content": tc["transcript"]},
                ],
                temperature=0.1,
                max_tokens=512,
                response_format={"type": "json_object"},
            )
            raw = completion.choices[0].message.content or "{}"
            llm_result = json.loads(raw)
        except Exception as e:
            print(f"  LLM ERROR: {e}")
            llm_result = {"intent": "unknown", "family": None, "dimensions": {}, "confidence": 0}

        latency_ms = int((time.time() - t0) * 1000)
        total_latency_ms += latency_ms

        scored = score_case(tc, llm_result)
        if scored["passed"]:
            pass_count += 1
            status = "✓ PASS"
        else:
            status = "✗ FAIL"

        print(f"  {status} | score={scored['score']}/{scored['max_score']} | {latency_ms}ms")
        print(f"  NLU → intent={llm_result.get('intent')!r} family={llm_result.get('family')!r} "
              f"confidence={llm_result.get('confidence', 0):.2f}")
        if scored["notes"]:
            for note in scored["notes"]:
                print(f"    ⚠ {note}")

        results.append({
            "id": tc["id"],
            "description": tc["description"],
            "passed": scored["passed"],
            "score": scored["score"],
            "max_score": scored["max_score"],
            "notes": scored["notes"],
            "latency_ms": latency_ms,
            "llm_output": llm_result,
        })

    # ── Summary ──────────────────────────────────────────────────────────────
    avg_latency = total_latency_ms // len(EVAL_CASES)
    go = pass_count >= PASS_THRESHOLD

    print("\n" + "═" * 72)
    print("  EVAL SUMMARY")
    print("═" * 72)
    for r in results:
        icon = "✓" if r["passed"] else "✗"
        print(f"  {icon} [{r['id']}] {r['description']} ({r['score']}/{r['max_score']})")
    print("")
    print(f"  Pass rate:    {pass_count}/{len(EVAL_CASES)}")
    print(f"  Threshold:    {PASS_THRESHOLD}/{len(EVAL_CASES)}")
    print(f"  Avg latency:  {avg_latency}ms")
    print("")
    if go:
        print(f"  STATUS: GO ✓ — {pass_count}/{len(EVAL_CASES)} cases passed (threshold {PASS_THRESHOLD})")
    else:
        print(f"  STATUS: NO-GO ✗ — {pass_count}/{len(EVAL_CASES)} cases passed (need {PASS_THRESHOLD})")
    print("═" * 72)

    # Write results to file for audit trail
    output_path = "/tmp/eval_live_results.json"
    with open(output_path, "w") as f:
        json.dump({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "pass_count": pass_count,
            "total_cases": len(EVAL_CASES),
            "threshold": PASS_THRESHOLD,
            "go": go,
            "avg_latency_ms": avg_latency,
            "results": results,
        }, f, indent=2)
    print(f"\n  Results written to: {output_path}")

    return 0 if go else 1


if __name__ == "__main__":
    sys.exit(run_eval())
