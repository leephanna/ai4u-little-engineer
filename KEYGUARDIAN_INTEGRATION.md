# AI4U Trust Policy Engine — KeyGuardian Integration

The Trust Policy Engine integrates with KeyGuardian to provide policy-driven rotation priorities and monitoring levels. This integration ensures that high-value assets are protected with elevated urgency, while low-confidence designs receive standard or minimal attention.

## Integration Mechanism

### 1. Trust Policy Signals
The Trust Policy Engine produces a `PolicyDecision` that includes KeyGuardian directives:
- `rotation_priority`: `critical`, `high`, `standard`, `low`
- `monitoring_level`: `elevated`, `standard`, `minimal`

These directives are passed to KeyGuardian via the `core/trust_integration.py` module.

### 2. Priority Adjustments
KeyGuardian's `apply_trust_signals` function processes the `PolicyDecision` and adjusts the rotation priority of affected secrets.

**Example:**
If a project is assigned the `TRUSTED_COMMERCIAL` tier, KeyGuardian will elevate the rotation priority of its secrets to `HIGH`. If an anomaly is detected on a public project, the priority is escalated to `CRITICAL`.

### 3. Monitoring Levels
KeyGuardian's `apply_trust_signals` function also adjusts the monitoring level of affected secrets.

**Example:**
If a project is assigned the `TRUSTED_COMMERCIAL` tier, KeyGuardian will elevate the monitoring level of its secrets to `ELEVATED`. If an anomaly is detected, the monitoring level is also elevated.

## Dashboard and Alerts
The KeyGuardian dashboard (`core/dashboard.py`) has been extended to display the Trust Policy Status, including the number of trusted commercial assets, blocked assets, and high-priority secrets.

**Alerts:**
If a secret's rotation priority is escalated to `CRITICAL`, KeyGuardian will immediately trigger an alert to the operator, ensuring that manual action is taken promptly.

## Hard Rules Enforced
1. **Never Rebuild KeyGuardian**: The Trust Policy Engine provides priority signals; KeyGuardian handles the actual rotation mechanics.
2. **Anomaly Escalation**: Any anomaly on a public project immediately escalates KeyGuardian rotation priority to `CRITICAL`.
3. **Strict Gating**: Unverified or low-confidence designs are strictly blocked from the marketplace.
