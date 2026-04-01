# AI4U Trust Policy Engine — Operator Console

The Operator Console (`apps/web/app/admin/vpl/page.tsx`) has been extended to display the assigned trust tier, tier distribution statistics, and a review queue for projects requiring operator intervention.

## Trust Tier View
The VPL page now includes a column for the assigned trust tier, allowing operators to quickly identify the confidence level of each project.

**Tier Distribution:**
- `TRUSTED_COMMERCIAL`: Green
- `VERIFIED`: Blue
- `LOW_CONFIDENCE`: Yellow
- `UNVERIFIED`: Red

## Review Queue
The VPL page also features a review queue for projects that require operator intervention. This queue is populated by the Trust Policy Engine when an anomaly is detected or a project is downgraded to `UNVERIFIED`.

**Review Actions:**
- **Approve**: Operator confirms the project is safe for public distribution.
- **Reject**: Operator blocks the project from the marketplace.
- **Investigate**: Operator requests further analysis or manual review.

## Integration with KeyGuardian
The Operator Console also displays KeyGuardian rotation priorities and monitoring levels for each project. This allows operators to prioritize their review efforts based on the urgency of the rotation.

**Priority Levels:**
- `CRITICAL`: Immediate rotation required.
- `HIGH`: Next scheduled window.
- `STANDARD`: Normal weekly/monthly cadence.
- `LOW`: Manual-only, no urgency.

## Hard Rules Enforced
1. **Operator Review**: Any anomaly on a public project immediately triggers an operator review.
2. **Strict Gating**: Unverified or low-confidence designs are strictly blocked from the marketplace.
3. **KeyGuardian Directives**: KeyGuardian rotation priorities and monitoring levels are displayed for operator visibility.
