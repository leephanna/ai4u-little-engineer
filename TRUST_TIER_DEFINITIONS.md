# AI4U Trust Policy Engine — Trust Tier Definitions

The Trust Policy Engine assigns one of four trust tiers to every project based on its Virtual Print Lab (VPL) score, exposure state, and anomaly signals. These tiers dictate marketplace eligibility, public listing permissions, and KeyGuardian rotation priorities.

## 1. UNVERIFIED
**Definition:** The design has not been validated by VPL, failed the validation, or poses a high risk.

**Criteria:**
- VPL result is missing.
- VPL grade is `F` (score < 40).
- VPL risk level is `high`.

**Permissions:**
- `marketplace_allowed`: **False**
- `public_listing_allowed`: **False**

**KeyGuardian Directives:**
- `rotation_priority`: `standard` (or `low` if private)
- `monitoring_level`: `minimal`

**Operator Review:**
- Required if the project was previously public or has active purchases.

## 2. LOW_CONFIDENCE
**Definition:** The design has a low VPL score or a history of repeated failures, making it unsuitable for public distribution.

**Criteria:**
- VPL grade is `D` (score 40–59).
- 3+ consecutive VPL failures.
- Repeated VPL failures on a newly created project.

**Permissions:**
- `marketplace_allowed`: **False**
- `public_listing_allowed`: **False** (Private use only)

**KeyGuardian Directives:**
- `rotation_priority`: `standard`
- `monitoring_level`: `minimal`

**Operator Review:**
- Required if the project is public or has active purchases.

## 3. VERIFIED
**Definition:** The design has passed VPL validation with a moderate to high score but is not yet a revenue-generating or public asset.

**Criteria:**
- VPL grade is `A` or `B` (score ≥ 75), and `ready_to_print` is true, but the project is private and free.
- VPL grade is `C` (score 60–74), and risk level is `low` or `moderate`.

**Permissions:**
- `marketplace_allowed`: **False** (Unless explicitly priced and public, which upgrades it to Trusted Commercial)
- `public_listing_allowed`: **True** (Eligible for library sharing)

**KeyGuardian Directives:**
- `rotation_priority`: `standard` (or `high` if public)
- `monitoring_level`: `standard`

**Operator Review:**
- Not required unless an anomaly is detected.

## 4. TRUSTED_COMMERCIAL
**Definition:** The design has a strong VPL result and is actively exposed to the public or generating revenue. This tier requires the highest level of protection.

**Criteria:**
- VPL grade is `A` or `B` (score ≥ 75).
- `ready_to_print` is true.
- Risk level is `low` or `moderate`.
- Project is public, priced > 0, or has active purchases.

**Permissions:**
- `marketplace_allowed`: **True**
- `public_listing_allowed`: **True**

**KeyGuardian Directives:**
- `rotation_priority`: `high` (or `critical` if an anomaly is detected)
- `monitoring_level`: `elevated`

**Operator Review:**
- Not required unless an anomaly is detected.

## Anomaly Escalation
Regardless of the assigned tier, if an anomaly (e.g., repeated CAD failures, generation spike) is detected on a public project:
- `rotation_priority` is immediately escalated to `CRITICAL`.
- `monitoring_level` is escalated to `ELEVATED`.
- `requires_operator_review` is set to **True**.
