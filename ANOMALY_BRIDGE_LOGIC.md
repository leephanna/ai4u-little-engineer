# AI4U Trust Policy Engine — Anomaly Bridge Logic

The Anomaly Bridge (`anomaly_bridge.py`) derives lightweight, actionable anomaly signals from pre-fetched Supabase data. It is not a full SIEM but provides critical context for the Trust Policy Engine to escalate KeyGuardian rotation priorities and trigger operator reviews.

## Signal Derivation

### 1. Repeated CAD Failures
**Trigger:** 3+ consecutive CAD generation failures (`failed` status in `cad_runs` table).
**Impact:** Flags the project for operator review and escalates KeyGuardian rotation priority to `CRITICAL` if the project is public.

### 2. Generation Spike
**Trigger:** 3x the 7-day average generation attempts (or ≥10 attempts if no history exists).
**Impact:** Flags the project for operator review and escalates KeyGuardian rotation priority to `CRITICAL` if the project is public.

### 3. Repeated VPL Failures
**Trigger:** 3+ consecutive VPL failures (`failed` or `F` grade in `virtual_print_tests` table).
**Impact:** Flags the project for operator review and downgrades the trust tier to `LOW_CONFIDENCE`.

### 4. Unusual Marketplace Activity
**Trigger:** 5x the 7-day average purchase rate (or ≥20 purchases if no history exists).
**Impact:** Elevates KeyGuardian monitoring level to `ELEVATED`.

## Integration with Trust Policy Engine
The Anomaly Bridge is invoked by the Trust Policy Engine during the evaluation process. The derived signals are passed as an `AnomalyInput` object, which influences the final `PolicyDecision`.

**Example:**
If a project has a `TRUSTED_COMMERCIAL` tier but experiences a generation spike, the Trust Policy Engine will:
1. Escalate KeyGuardian rotation priority to `CRITICAL`.
2. Elevate KeyGuardian monitoring level to `ELEVATED`.
3. Set `requires_operator_review` to **True**.

This ensures that high-value assets are protected immediately upon detecting unusual activity, without waiting for the next scheduled rotation window.
