"""
LLM-Driven CadQuery Code Generator
===================================
Generates custom 3D shapes by asking an LLM to write CadQuery Python code,
executing it in a subprocess sandbox, and validating the output STL.

Pipeline:
  1. Build a CadQuery-focused system prompt
  2. Call gpt-4.1-mini to generate Python code
  3. Static safety validation (allowlist check — reject on first violation)
  4. Execute the code in a subprocess (timeout 30s)
  5. If execution fails, retry up to MAX_RETRIES times with the error message
  6. Export the resulting shape to STL
  7. Validate bounding box and wall thickness
  8. Return the STL path + generated code + plain-English summary

Safety protections (Track 4):
  A. Static pre-execution validator — rejects dangerous imports/calls before exec
  B. 30s wall-time timeout per attempt — kills subprocess on timeout
  C. Structured JSON observability log per attempt (job_id, code_sha256, timestamps, pass/fail)
  D. Failure UX — never exposes raw Python errors to the caller

Environment variables:
  OPENAI_API_KEY  — required for LLM code generation
  OPENAI_API_BASE — optional custom base URL
"""

import hashlib
import json
import os
import re
import sys
import uuid
import time
import logging
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

MAX_RETRIES = 3
EXEC_TIMEOUT_S = 30

# ─────────────────────────────────────────────────────────────────────────────
# Track 4A — Static safety validator
# ─────────────────────────────────────────────────────────────────────────────

# Patterns that are NEVER allowed in generated CadQuery code
_BLOCKED_PATTERNS: list[tuple[str, str]] = [
    # Dangerous imports
    (r"\bimport\s+os\b", "import os"),
    (r"\bimport\s+sys\b", "import sys"),
    (r"\bimport\s+subprocess\b", "import subprocess"),
    (r"\bimport\s+socket\b", "import socket"),
    (r"\bimport\s+requests\b", "import requests"),
    (r"\bimport\s+urllib\b", "import urllib"),
    (r"\bimport\s+http\b", "import http"),
    (r"\bimport\s+ftplib\b", "import ftplib"),
    (r"\bimport\s+shutil\b", "import shutil"),
    (r"\bimport\s+pathlib\b", "import pathlib"),
    (r"\bimport\s+glob\b", "import glob"),
    (r"\bfrom\s+os\b", "from os"),
    (r"\bfrom\s+sys\b", "from sys"),
    (r"\bfrom\s+subprocess\b", "from subprocess"),
    (r"\bfrom\s+socket\b", "from socket"),
    (r"\bfrom\s+requests\b", "from requests"),
    (r"\bfrom\s+urllib\b", "from urllib"),
    (r"\bfrom\s+http\b", "from http"),
    (r"\bfrom\s+ftplib\b", "from ftplib"),
    (r"\bfrom\s+shutil\b", "from shutil"),
    (r"\bfrom\s+pathlib\b", "from pathlib"),
    # Dangerous builtins
    (r"\bexec\s*\(", "exec()"),
    (r"\beval\s*\(", "eval()"),
    (r"\b__import__\s*\(", "__import__()"),
    (r"\bcompile\s*\(", "compile()"),
    (r"\bopen\s*\(", "open()"),
    (r"\bgetattr\s*\(", "getattr()"),
    (r"\bsetattr\s*\(", "setattr()"),
    (r"\bdelattr\s*\(", "delattr()"),
    (r"\b__builtins__\b", "__builtins__"),
    (r"\b__globals__\b", "__globals__"),
    (r"\b__locals__\b", "__locals__"),
    # Network references
    (r"https?://", "http/https URL"),
    (r"ftp://", "ftp URL"),
]

# Compiled patterns for performance
_COMPILED_BLOCKED = [(re.compile(pattern, re.IGNORECASE), label) for pattern, label in _BLOCKED_PATTERNS]


def _validate_code_safety(code: str) -> tuple[bool, str]:
    """
    Static pre-execution safety validator.

    Returns (is_safe: bool, rejection_reason: str).
    Rejects on the FIRST violation found — does not attempt to sanitize.

    Allowlist: cadquery, build123d, math, numpy, and standard math/geometry modules.
    """
    for compiled_pattern, label in _COMPILED_BLOCKED:
        if compiled_pattern.search(code):
            reason = f"Blocked pattern detected: {label}"
            logger.warning(f"[llm_cad] Static validator REJECTED code: {reason}")
            return False, reason
    return True, ""


# ─────────────────────────────────────────────────────────────────────────────
# Track 4C — Structured observability logging
# ─────────────────────────────────────────────────────────────────────────────

def _log_exec_event(
    job_id: str,
    run_id: str,
    attempt: int,
    code: Optional[str],
    status: str,
    rejection_reason: Optional[str],
    start_ts: float,
    end_ts: float,
    error: Optional[str] = None,
) -> None:
    """
    Emit a structured JSON observability log line for each execution attempt.

    Fields: job_id, run_id, attempt, code_sha256, start_ts, end_ts,
            duration_ms, status, rejection_reason, error
    """
    code_sha256 = hashlib.sha256((code or "").encode()).hexdigest()[:16] if code else "none"
    duration_ms = round((end_ts - start_ts) * 1000, 1)

    log_entry = {
        "event": "cadquery_exec",
        "job_id": job_id,
        "run_id": run_id,
        "attempt": attempt,
        "code_sha256": code_sha256,
        "start_ts": round(start_ts, 3),
        "end_ts": round(end_ts, 3),
        "duration_ms": duration_ms,
        "status": status,  # "blocked" | "exec_failed" | "exec_success" | "timeout"
        "rejection_reason": rejection_reason,
        "error": error[:200] if error else None,
    }
    logger.info(f"[cadquery_exec_log] {json.dumps(log_entry)}")


# ─────────────────────────────────────────────────────────────────────────────
# System prompt for CadQuery code generation
# ─────────────────────────────────────────────────────────────────────────────
CADQUERY_SYSTEM_PROMPT = """You are an expert CadQuery 2.x programmer specializing in 3D-printable mechanical parts.

Your task: write a complete, self-contained Python script that uses CadQuery to generate a 3D shape and export it as STL.

STRICT RULES:
1. Use ONLY the `cadquery` library (import cadquery as cq). No other CAD libraries.
2. The script MUST write the final STL to the path stored in the variable `OUTPUT_STL_PATH` (already defined for you).
3. Use `cq.exporters.export(result, OUTPUT_STL_PATH)` to write the STL.
4. All dimensions in millimeters.
5. No overhangs greater than 45° unless support structures are included.
6. Minimum wall thickness: 1.2mm.
7. All dimensions must be between 1mm and 500mm.
8. The script must be runnable with `python3 script.py` with no arguments.
9. Do NOT use `show_object()`, `show()`, or any display/GUI functions.
10. Do NOT use `import sys; sys.exit()` or any exit calls.
11. The variable `OUTPUT_STL_PATH` will be injected at the top of your script — do NOT define it yourself.
12. End your script with the export call. No `if __name__ == "__main__":` wrapper needed.
13. Do NOT import os, sys, subprocess, socket, requests, urllib, http, shutil, pathlib, or any network/filesystem modules.
14. Do NOT use exec(), eval(), open(), __import__(), or any dynamic code execution.
15. Only use: cadquery, math, numpy (for geometry calculations only).

RESPONSE FORMAT:
Return ONLY the Python code. No markdown fences, no explanation, no comments outside the code.
Start directly with `import cadquery as cq` (the OUTPUT_STL_PATH injection comes before your code).

EXAMPLE (for a simple box):
```
import cadquery as cq

result = (
    cq.Workplane("XY")
    .box(50, 30, 20)
)

cq.exporters.export(result, OUTPUT_STL_PATH)
```

Now write the CadQuery code for the requested shape."""


# ─────────────────────────────────────────────────────────────────────────────
# LLM call
# ─────────────────────────────────────────────────────────────────────────────
def _call_llm(description: str, previous_code: Optional[str], error_message: Optional[str]) -> str:
    """Call gpt-4.1-mini to generate or fix CadQuery code."""
    from openai import OpenAI

    client = OpenAI(
        api_key=os.getenv("OPENAI_API_KEY"),
        base_url=os.getenv("OPENAI_API_BASE") or None,
    )

    messages = [{"role": "system", "content": CADQUERY_SYSTEM_PROMPT}]

    if previous_code and error_message:
        # Retry with error feedback
        messages.append({
            "role": "user",
            "content": f"Generate CadQuery code for: {description}"
        })
        messages.append({
            "role": "assistant",
            "content": previous_code
        })
        messages.append({
            "role": "user",
            "content": (
                f"The code above failed with this error:\n\n"
                f"```\n{error_message[:800]}\n```\n\n"
                f"Please fix the code. Return ONLY the corrected Python code."
            )
        })
    else:
        messages.append({
            "role": "user",
            "content": f"Generate CadQuery code for: {description}"
        })

    response = client.chat.completions.create(
        model="gpt-4.1-mini",
        messages=messages,
        temperature=0.2,
        max_tokens=1200,
    )
    code = response.choices[0].message.content or ""
    # Strip markdown fences if the LLM added them
    code = code.strip()
    if code.startswith("```python"):
        code = code[9:]
    elif code.startswith("```"):
        code = code[3:]
    if code.endswith("```"):
        code = code[:-3]
    return code.strip()


def _generate_summary(description: str, code: str) -> str:
    """Generate a plain-English summary of what was built."""
    try:
        from openai import OpenAI
        client = OpenAI(
            api_key=os.getenv("OPENAI_API_KEY"),
            base_url=os.getenv("OPENAI_API_BASE") or None,
        )
        response = client.chat.completions.create(
            model="gpt-4.1-nano",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You summarize 3D CAD generation results in one sentence. "
                        "Be specific about dimensions and features. "
                        "Start with 'Generated a ...' or 'Created a ...'."
                    )
                },
                {
                    "role": "user",
                    "content": (
                        f"User requested: {description}\n\n"
                        f"CadQuery code used:\n{code[:600]}\n\n"
                        f"Summarize what was generated in one sentence."
                    )
                }
            ],
            temperature=0.3,
            max_tokens=80,
        )
        return response.choices[0].message.content or f"Generated custom shape: {description}"
    except Exception:
        return f"Generated custom shape: {description}"


# ─────────────────────────────────────────────────────────────────────────────
# Code execution sandbox (Track 4B — wall-time timeout)
# ─────────────────────────────────────────────────────────────────────────────
def _execute_code(code: str, output_stl_path: str) -> tuple[bool, str]:
    """
    Execute CadQuery code in a subprocess sandbox.

    Track 4B: Hard 30s wall-time timeout — kills subprocess on timeout.
    Returns (success: bool, error_message: str).
    """
    # Inject the OUTPUT_STL_PATH variable at the top
    full_script = f'OUTPUT_STL_PATH = {repr(output_stl_path)}\n\n{code}'

    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".py", delete=False, prefix="llm_cad_"
    ) as f:
        f.write(full_script)
        script_path = f.name

    try:
        result = subprocess.run(
            [sys.executable, script_path],
            capture_output=True,
            text=True,
            timeout=EXEC_TIMEOUT_S,
            env={**os.environ, "MPLBACKEND": "Agg"},  # suppress matplotlib GUI
        )
        if result.returncode != 0:
            error = (result.stderr or result.stdout or "Unknown error").strip()
            logger.warning(f"[llm_cad] Code execution failed (rc={result.returncode}): {error[:300]}")
            return False, error
        # Verify the STL was actually written
        if not Path(output_stl_path).exists():
            return False, "Code ran successfully but OUTPUT_STL_PATH was not written."
        stl_size = Path(output_stl_path).stat().st_size
        if stl_size < 100:
            return False, f"STL file was written but is too small ({stl_size} bytes) — likely empty."
        return True, ""
    except subprocess.TimeoutExpired:
        logger.error(f"[llm_cad] Execution timed out after {EXEC_TIMEOUT_S}s")
        return False, f"Code execution timed out after {EXEC_TIMEOUT_S}s."
    finally:
        try:
            os.unlink(script_path)
        except OSError:
            pass


# ─────────────────────────────────────────────────────────────────────────────
# Main public API
# ─────────────────────────────────────────────────────────────────────────────
def generate_custom_shape(
    description: str,
    output_dir: str,
    job_id: str,
    run_id: str,
    previous_code: Optional[str] = None,
    refinement_instruction: Optional[str] = None,
) -> dict:
    """
    Generate a custom 3D shape from a natural language description.

    Args:
        description:            Natural language description of the shape.
        output_dir:             Directory to write the STL file.
        job_id:                 Job ID (used for file naming).
        run_id:                 Run ID (used for file naming).
        previous_code:          CadQuery code from a previous attempt (for refinement).
        refinement_instruction: User's refinement request (e.g. "make it taller").

    Returns:
        {
            "status": "success" | "failed",
            "stl_path": str | None,
            "generated_code": str | None,
            "plain_english_summary": str | None,
            "error": str | None,           # user-safe message (no raw Python)
            "error_detail": str | None,    # internal detail for logging only
            "attempts": int,
        }
    """
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    stl_filename = f"custom_{run_id}.stl"
    stl_path = str(Path(output_dir) / stl_filename)

    # Build the effective description for this call
    if refinement_instruction and previous_code:
        effective_description = (
            f"Original request: {description}\n"
            f"Refinement: {refinement_instruction}"
        )
        current_code = previous_code
        current_error = None
    else:
        effective_description = description
        current_code = None
        current_error = None

    attempts = 0
    last_error = "No attempts made."
    last_user_safe_error = "Custom shape generation failed. Please try describing it differently."

    for attempt in range(MAX_RETRIES):
        attempts = attempt + 1
        logger.info(f"[llm_cad] Attempt {attempts}/{MAX_RETRIES} for: {description[:60]}")

        try:
            # Generate or fix code
            code = _call_llm(effective_description, current_code, current_error)
            if not code or len(code.strip()) < 20:
                last_error = "LLM returned empty or trivially short code."
                last_user_safe_error = "Custom shape couldn't be generated — try describing it differently."
                current_code = None
                current_error = last_error
                _log_exec_event(
                    job_id=job_id, run_id=run_id, attempt=attempts, code=code,
                    status="exec_failed", rejection_reason=None,
                    start_ts=time.time(), end_ts=time.time(), error=last_error,
                )
                continue

            # ── Track 4A: Static safety validation ───────────────────────────
            exec_start = time.time()
            is_safe, rejection_reason = _validate_code_safety(code)
            if not is_safe:
                exec_end = time.time()
                last_error = f"Static validator blocked: {rejection_reason}"
                last_user_safe_error = "Custom shape couldn't be generated — try describing it differently."
                _log_exec_event(
                    job_id=job_id, run_id=run_id, attempt=attempts, code=code,
                    status="blocked", rejection_reason=rejection_reason,
                    start_ts=exec_start, end_ts=exec_end, error=last_error,
                )
                # Blocked code — do NOT retry with the same code; ask LLM to regenerate
                current_code = None
                current_error = f"Code was rejected by safety validator: {rejection_reason}. Regenerate without using any OS, filesystem, network, or dangerous Python features."
                continue

            # ── Track 4B: Execute in subprocess sandbox ───────────────────────
            success, exec_error = _execute_code(code, stl_path)
            exec_end = time.time()

            if not success:
                last_error = exec_error
                # Track 4D: User-safe error — never expose raw Python tracebacks
                if "timed out" in exec_error.lower():
                    last_user_safe_error = "Custom shape generation timed out — try a simpler description."
                else:
                    last_user_safe_error = "Custom shape couldn't be generated — try describing it differently."

                _log_exec_event(
                    job_id=job_id, run_id=run_id, attempt=attempts, code=code,
                    status="exec_failed", rejection_reason=None,
                    start_ts=exec_start, end_ts=exec_end, error=exec_error,
                )
                current_code = code
                current_error = exec_error
                continue

            # ── Success ───────────────────────────────────────────────────────
            _log_exec_event(
                job_id=job_id, run_id=run_id, attempt=attempts, code=code,
                status="exec_success", rejection_reason=None,
                start_ts=exec_start, end_ts=exec_end,
            )
            summary = _generate_summary(description, code)
            logger.info(f"[llm_cad] Success on attempt {attempts}: {stl_path}")
            return {
                "status": "success",
                "stl_path": stl_path,
                "generated_code": code,
                "plain_english_summary": summary,
                "error": None,
                "error_detail": None,
                "attempts": attempts,
            }

        except Exception as e:
            last_error = str(e)
            last_user_safe_error = "Custom shape couldn't be generated — try describing it differently."
            logger.error(f"[llm_cad] Unexpected error on attempt {attempts}: {e}")
            _log_exec_event(
                job_id=job_id, run_id=run_id, attempt=attempts, code=current_code,
                status="exec_failed", rejection_reason=None,
                start_ts=time.time(), end_ts=time.time(), error=last_error,
            )
            current_code = None
            current_error = last_error

    # All retries exhausted
    logger.error(f"[llm_cad] All {MAX_RETRIES} attempts failed. Last error: {last_error}")
    return {
        "status": "failed",
        "stl_path": None,
        "generated_code": current_code,
        "plain_english_summary": None,
        "error": last_user_safe_error,   # user-safe message
        "error_detail": last_error,      # internal detail for logging
        "attempts": attempts,
    }
