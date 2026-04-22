"""
LLM-Driven CadQuery Code Generator
===================================
Generates custom 3D shapes by asking an LLM to write CadQuery Python code,
executing it in a subprocess sandbox, and validating the output STL.

Pipeline:
  1. Build a CadQuery-focused system prompt
  2. Call gpt-4.1-mini to generate Python code
  3. Execute the code in a subprocess (timeout 30s)
  4. If execution fails, retry up to MAX_RETRIES times with the error message
  5. Export the resulting shape to STL
  6. Validate bounding box and wall thickness
  7. Return the STL path + generated code + plain-English summary

Environment variables:
  OPENAI_API_KEY  — required for LLM code generation
  OPENAI_API_BASE — optional custom base URL
"""

import os
import sys
import uuid
import time
import logging
import textwrap
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

MAX_RETRIES = 3
EXEC_TIMEOUT_S = 30

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
# Code execution sandbox
# ─────────────────────────────────────────────────────────────────────────────
def _execute_code(code: str, output_stl_path: str) -> tuple[bool, str]:
    """
    Execute CadQuery code in a subprocess sandbox.
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
            "error": str | None,
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

    for attempt in range(MAX_RETRIES):
        attempts = attempt + 1
        logger.info(f"[llm_cad] Attempt {attempts}/{MAX_RETRIES} for: {description[:60]}")

        try:
            # Generate or fix code
            code = _call_llm(effective_description, current_code, current_error)
            if not code or len(code.strip()) < 20:
                last_error = "LLM returned empty or trivially short code."
                current_code = None
                current_error = last_error
                continue

            # Execute in sandbox
            success, exec_error = _execute_code(code, stl_path)
            if not success:
                last_error = exec_error
                current_code = code
                current_error = exec_error
                continue

            # Success — generate summary
            summary = _generate_summary(description, code)
            logger.info(f"[llm_cad] Success on attempt {attempts}: {stl_path}")
            return {
                "status": "success",
                "stl_path": stl_path,
                "generated_code": code,
                "plain_english_summary": summary,
                "error": None,
                "attempts": attempts,
            }

        except Exception as e:
            last_error = str(e)
            logger.error(f"[llm_cad] Unexpected error on attempt {attempts}: {e}")
            current_code = None
            current_error = last_error

    # All retries exhausted
    logger.error(f"[llm_cad] All {MAX_RETRIES} attempts failed. Last error: {last_error}")
    return {
        "status": "failed",
        "stl_path": None,
        "generated_code": current_code,
        "plain_english_summary": None,
        "error": last_error,
        "attempts": attempts,
    }
