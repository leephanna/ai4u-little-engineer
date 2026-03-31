"""
VPL Slicer Simulator
====================
Runs PrusaSlicer CLI in headless mode to produce real G-code and extract
print time, filament usage, and layer count from the output.

Slicer: PrusaSlicer 2.4.0 (installed via apt)
Profile: Generic FFF, 0.2mm layer height, 20% infill, 0.4mm nozzle
"""
from __future__ import annotations

import os
import re
import subprocess
import tempfile
from dataclasses import dataclass, field
from typing import Optional

PRUSA_SLICER_BIN = "/usr/bin/prusa-slicer"

# Default slicer settings — conservative, generic FFF
DEFAULT_SETTINGS = {
    "layer_height": "0.2",
    "fill_density": "20%",
    "nozzle_diameter": "0.4",
    "filament_type": "PLA",
    "support_material": "0",
    "brim_width": "0",
}


@dataclass
class SlicerResult:
    success: bool
    print_time_seconds: Optional[int]    # parsed from gcode header
    print_time_human: Optional[str]      # e.g. "7m 0s"
    filament_mm: Optional[float]
    filament_cm3: Optional[float]
    filament_g: Optional[float]          # estimated at 1.24 g/cm³ for PLA
    layer_count: Optional[int]
    gcode_size_bytes: Optional[int]
    slicer_stderr: str = ""
    issues: list[str] = field(default_factory=list)
    score_contribution: int = 0          # 0-40 points

    def to_dict(self) -> dict:
        return {
            "success": self.success,
            "print_time_seconds": self.print_time_seconds,
            "print_time_human": self.print_time_human,
            "filament_mm": self.filament_mm,
            "filament_cm3": self.filament_cm3,
            "filament_g": self.filament_g,
            "layer_count": self.layer_count,
            "gcode_size_bytes": self.gcode_size_bytes,
            "issues": self.issues,
            "score_contribution": self.score_contribution,
        }


def _parse_time_to_seconds(time_str: str) -> int:
    """Convert '7m 0s' or '1h 23m 45s' to total seconds."""
    total = 0
    for match in re.finditer(r"(\d+)([hms])", time_str):
        val, unit = int(match.group(1)), match.group(2)
        if unit == "h":
            total += val * 3600
        elif unit == "m":
            total += val * 60
        elif unit == "s":
            total += val
    return total


def run_slicer(stl_path: str, settings: Optional[dict] = None) -> SlicerResult:
    """Run PrusaSlicer on the given STL and parse the results."""
    if not os.path.exists(PRUSA_SLICER_BIN):
        return SlicerResult(
            success=False,
            print_time_seconds=None,
            print_time_human=None,
            filament_mm=None,
            filament_cm3=None,
            filament_g=None,
            layer_count=None,
            gcode_size_bytes=None,
            slicer_stderr="PrusaSlicer not found at /usr/bin/prusa-slicer",
            issues=["Slicer unavailable — using geometry-only scoring"],
            score_contribution=20,  # partial credit when slicer unavailable
        )

    cfg = {**DEFAULT_SETTINGS, **(settings or {})}

    with tempfile.NamedTemporaryFile(suffix=".gcode", delete=False) as gf:
        gcode_path = gf.name

    cmd = [
        PRUSA_SLICER_BIN,
        "--export-gcode",
        f"--layer-height={cfg['layer_height']}",
        f"--fill-density={cfg['fill_density']}",
        f"--nozzle-diameter={cfg['nozzle_diameter']}",
        "--output", gcode_path,
        stl_path,
    ]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=120,
        )
        stderr = result.stdout + result.stderr  # PrusaSlicer logs to stdout
    except subprocess.TimeoutExpired:
        return SlicerResult(
            success=False,
            print_time_seconds=None,
            print_time_human=None,
            filament_mm=None,
            filament_cm3=None,
            filament_g=None,
            layer_count=None,
            gcode_size_bytes=None,
            slicer_stderr="Slicer timed out after 120s",
            issues=["Slicer timed out — part may be too complex"],
            score_contribution=10,
        )

    if result.returncode != 0 or not os.path.exists(gcode_path):
        return SlicerResult(
            success=False,
            print_time_seconds=None,
            print_time_human=None,
            filament_mm=None,
            filament_cm3=None,
            filament_g=None,
            layer_count=None,
            gcode_size_bytes=None,
            slicer_stderr=stderr[:500],
            issues=["Slicer failed — geometry may be non-printable"],
            score_contribution=0,
        )

    # --- Parse gcode metadata ---
    gcode_size = os.path.getsize(gcode_path)
    issues: list[str] = []
    print_time_human = None
    print_time_seconds = None
    filament_mm = None
    filament_cm3 = None
    filament_g = None
    layer_count = None

    with open(gcode_path, "r", errors="replace") as gf:
        gcode_lines = gf.readlines()

    for line in gcode_lines[:100]:  # metadata is in the header
        line = line.strip()
        m = re.match(r";\s*estimated printing time \(normal mode\)\s*=\s*(.+)", line)
        if m:
            print_time_human = m.group(1).strip()
            print_time_seconds = _parse_time_to_seconds(print_time_human)

        m = re.match(r";\s*filament used \[mm\]\s*=\s*([\d.]+)", line)
        if m:
            filament_mm = float(m.group(1))

        m = re.match(r";\s*filament used \[cm3\]\s*=\s*([\d.]+)", line)
        if m:
            filament_cm3 = float(m.group(1))
            filament_g = round(filament_cm3 * 1.24, 2)  # PLA density

    # Count layers
    layer_count = sum(1 for line in gcode_lines if line.startswith(";LAYER_CHANGE") or line.startswith("; layer"))

    # Clean up temp gcode
    try:
        os.unlink(gcode_path)
    except OSError:
        pass

    # --- Scoring (0-40 points) ---
    score = 40
    if print_time_seconds is not None and print_time_seconds > 14400:  # > 4 hours
        issues.append(f"Long print time ({print_time_human}) — consider splitting the part")
        score -= 5
    if filament_g is not None and filament_g > 100:
        issues.append(f"High material usage ({filament_g:.1f}g) — consider hollowing")
        score -= 5
    score = max(0, score)

    return SlicerResult(
        success=True,
        print_time_seconds=print_time_seconds,
        print_time_human=print_time_human,
        filament_mm=filament_mm,
        filament_cm3=filament_cm3,
        filament_g=filament_g,
        layer_count=layer_count,
        gcode_size_bytes=gcode_size,
        slicer_stderr=stderr[:200],
        issues=issues,
        score_contribution=score,
    )
