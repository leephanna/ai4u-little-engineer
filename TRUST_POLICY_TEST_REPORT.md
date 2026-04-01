# AI4U Trust Policy Engine — Test Report

This document summarizes the test coverage and results for the Trust Policy Engine.

## Test Suite Overview
The test suite (`tests/test_trust_policy_engine.py`) covers all core components of the Trust Policy Engine, including tier assignment logic, anomaly signal derivation, marketplace gating, KeyGuardian directives, and edge cases.

**Total Tests:** 71
**Status:** All Passed (100% success rate)

## Test Categories

### 1. Tier Assignment (13 tests)
Verifies that the correct trust tier is assigned based on VPL inputs and project state.
- **Trusted Commercial:** Grade A/B, public/paid.
- **Verified:** Grade A/B/C, private/free.
- **Low Confidence:** Grade D, consecutive failures.
- **Unverified:** Grade F, missing data, high risk.

### 2. Marketplace Gating (6 tests)
Verifies the `marketplace_allowed` and `public_listing_allowed` flags.
- **Trusted Commercial:** Both allowed.
- **Verified:** Public listing allowed, marketplace blocked (unless explicitly priced).
- **Low Confidence / Unverified:** Both blocked.

### 3. Operator Review (5 tests)
Verifies the `requires_operator_review` flag.
- **Triggers:** Anomalies on public projects, unverified public projects, repeated failures on new projects.
- **No Review:** Clean Grade A private projects.

### 4. KeyGuardian Directives (8 tests)
Verifies the `rotation_priority` and `monitoring_level` assignments.
- **Trusted Commercial:** High priority, elevated monitoring.
- **Anomalies:** Critical priority, elevated monitoring.
- **Unverified / Low Confidence:** Standard priority, minimal monitoring.

### 5. Anomaly Bridge (11 tests)
Verifies the derivation of anomaly signals from pre-fetched data.
- **Signals:** Repeated CAD failures, generation spikes, repeated VPL failures, unusual marketplace activity.
- **Edge Cases:** No history, empty inputs.

### 6. KeyGuardian Trust Integration (6 tests)
Verifies the translation of `PolicyDecision` into KeyGuardian priority adjustments.
- **Adjustments:** Trusted Commercial → High, Anomalies → Critical.
- **Summary:** Correctly builds the trust summary for the dashboard.

### 7. Output Schema Validation (8 tests)
Verifies that the `PolicyDecision` output contains all required fields and is serializable to dict and JSON.

### 8. Edge Cases and Boundary Conditions (14 tests)
Verifies the engine's behavior at score boundaries (e.g., exactly 75, exactly 40) and handles missing or unusual inputs gracefully.

## Compliance Gate
In addition to the Trust Policy Engine tests, the full compliance gate (`scripts/compliance.sh`) was run across the entire monorepo.

**Results:**
- TypeScript typecheck: PASS
- ESLint: PASS
- CAD worker pytest (including VPL tests): PASS (163 tests)

**Status:** GO ✓ — All compliance checks passed.
