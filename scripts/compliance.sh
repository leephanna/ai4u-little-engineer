#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# compliance.sh — Little Engineer Compliance Gate
#
# Runs all static analysis and unit tests that must pass before any deploy:
#   1. TypeScript typecheck (all workspaces)
#   2. ESLint (web app)
#   3. CAD worker pytest (74 unit tests)
#
# Exit code 0 = all checks pass (GO)
# Exit code 1 = one or more checks failed (NO-GO)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASS=0
FAIL=0
RESULTS=()

run_check() {
  local name="$1"
  local cmd="$2"
  local dir="${3:-$REPO_ROOT}"
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  CHECK: $name"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  pushd "$dir" > /dev/null
  if eval "$cmd"; then
    echo "  ✓ PASS: $name"
    RESULTS+=("PASS  $name")
    PASS=$((PASS + 1))
  else
    echo "  ✗ FAIL: $name"
    RESULTS+=("FAIL  $name")
    FAIL=$((FAIL + 1))
  fi
  popd > /dev/null
}

echo "════════════════════════════════════════════════════════════════════════"
echo "  Little Engineer — Compliance Gate"
echo "  $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "════════════════════════════════════════════════════════════════════════"

# ── 1. TypeScript typecheck ───────────────────────────────────────────────────
run_check "TypeScript typecheck (all workspaces)" \
  "pnpm typecheck 2>&1 | tee /tmp/typecheck.log; grep -q 'Tasks:.*successful' /tmp/typecheck.log && ! grep -q 'Failed:' /tmp/typecheck.log" \
  "$REPO_ROOT"

# ── 2. ESLint ────────────────────────────────────────────────────────────────
run_check "ESLint (web app)" \
  "pnpm lint 2>&1 | tee /tmp/lint.log; ! grep -q 'Error:' /tmp/lint.log" \
  "$REPO_ROOT"

# ── 3. CAD worker pytest ─────────────────────────────────────────────────────
run_check "CAD worker pytest (74 unit tests)" \
  "python3 -m pytest tests/ -v --tb=short" \
  "$REPO_ROOT/apps/cad-worker"

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════════════════"
echo "  COMPLIANCE SUMMARY"
echo "════════════════════════════════════════════════════════════════════════"
for r in "${RESULTS[@]}"; do
  echo "  $r"
done
echo ""
echo "  Total: $((PASS + FAIL)) checks | $PASS passed | $FAIL failed"
echo "════════════════════════════════════════════════════════════════════════"

if [ "$FAIL" -eq 0 ]; then
  echo "  STATUS: GO ✓ — All compliance checks passed"
  echo "════════════════════════════════════════════════════════════════════════"
  exit 0
else
  echo "  STATUS: NO-GO ✗ — $FAIL check(s) failed"
  echo "════════════════════════════════════════════════════════════════════════"
  exit 1
fi
