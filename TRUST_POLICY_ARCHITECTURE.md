# AI4U Trust Policy Engine — Architecture Document

## Overview
The **Trust Policy Engine** is the central decision-making module that connects the Virtual Print Lab (VPL) and KeyGuardian into a single, policy-driven trust and protection system. It consumes VPL confidence scores, project exposure states, and anomaly signals to produce a structured `PolicyDecision`. This decision dictates marketplace eligibility, public listing permissions, and KeyGuardian rotation priorities.

## Core Components

### 1. Trust Policy Engine (`trust_policy_engine.py`)
The primary module that evaluates inputs and assigns a trust tier. It does not rebuild VPL or KeyGuardian; it acts as the policy bridge between them.

**Inputs:**
- `VPLInput`: Print success score, grade, readiness, risk level, and failure history.
- `ProjectInput`: Public status, price, earnings, and purchase history.
- `AnomalyInput`: Boolean flags for repeated failures or unusual activity.

**Outputs (`PolicyDecision`):**
- `trust_tier`: The assigned trust level.
- `marketplace_allowed`: Boolean flag for marketplace sales.
- `public_listing_allowed`: Boolean flag for public library visibility.
- `requires_operator_review`: Boolean flag for manual intervention.
- `rotation_priority`: KeyGuardian rotation urgency (`critical`, `high`, `standard`, `low`).
- `monitoring_level`: KeyGuardian monitoring frequency (`elevated`, `standard`, `minimal`).

### 2. Anomaly Bridge (`anomaly_bridge.py`)
Derives lightweight, actionable anomaly signals from pre-fetched Supabase data. It is not a full SIEM but provides critical context for the Trust Policy Engine.

**Signals Detected:**
- `repeated_cad_failures`: 3+ consecutive CAD generation failures.
- `generation_spike`: 3x the 7-day average generation attempts.
- `repeated_vpl_failures`: 3+ consecutive VPL failures.
- `unusual_marketplace_activity`: 5x the 7-day average purchase rate.

### 3. KeyGuardian Trust Integration (`core/trust_integration.py`)
Translates the `PolicyDecision` into actionable KeyGuardian directives. It adjusts rotation priorities and monitoring levels based on the assigned trust tier and anomaly signals.

**Priority Adjustments:**
- `TRUSTED_COMMERCIAL` → `HIGH` priority, `ELEVATED` monitoring.
- Anomalies on public projects → `CRITICAL` priority.
- `UNVERIFIED` / `LOW_CONFIDENCE` → `STANDARD` priority, `MINIMAL` monitoring.

## Integration Points

### Marketplace Gating
The Trust Policy Engine enforces marketplace eligibility at two levels:
1. **Listing Page (`apps/web/app/marketplace/page.tsx`)**: Filters out projects where `marketplace_allowed` is false.
2. **Checkout API (`apps/web/app/api/marketplace/checkout/route.ts`)**: Blocks purchases if the project's trust tier does not permit sales.

### Operator Console
The admin VPL page (`apps/web/app/admin/vpl/page.tsx`) has been extended to display the assigned trust tier, tier distribution statistics, and a review queue for projects requiring operator intervention.

### Database Schema
Migration `008_trust_policy_engine.sql` introduces the `trust_policy_decisions` table to persist policy evaluations, providing an audit trail for all trust assignments.

## Hard Rules Enforced
1. **Never Rebuild VPL**: The engine consumes VPL outputs; it does not alter the scoring algorithm.
2. **Never Rebuild KeyGuardian**: The engine provides priority signals; KeyGuardian handles the actual rotation mechanics.
3. **Strict Gating**: Unverified or low-confidence designs are strictly blocked from the marketplace.
4. **Anomaly Escalation**: Any anomaly on a public project immediately escalates KeyGuardian rotation priority to `CRITICAL`.
