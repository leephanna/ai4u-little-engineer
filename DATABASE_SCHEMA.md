# AI4U Trust Policy Engine — Database Schema

The Trust Policy Engine introduces a new table, `trust_policy_decisions`, to persist policy evaluations and provide an audit trail for all trust assignments.

## `trust_policy_decisions` Table

### Columns
- `id`: UUID, primary key.
- `project_id`: UUID, foreign key to `projects.id`.
- `job_id`: UUID, foreign key to `jobs.id` (optional).
- `vpl_test_id`: UUID, foreign key to `virtual_print_tests.id` (optional).
- `trust_tier`: Text, the assigned trust tier (`unverified`, `low_confidence`, `verified`, `trusted_commercial`).
- `marketplace_allowed`: Boolean, flag for marketplace sales.
- `public_listing_allowed`: Boolean, flag for public library visibility.
- `requires_operator_review`: Boolean, flag for manual intervention.
- `rotation_priority`: Text, KeyGuardian rotation urgency (`critical`, `high`, `standard`, `low`).
- `monitoring_level`: Text, KeyGuardian monitoring frequency (`elevated`, `standard`, `minimal`).
- `notes`: JSONB, array of strings with evaluation notes.
- `decision_inputs`: JSONB, raw inputs stored for audit trail.
- `decided_at`: Timestamp with time zone, default `now()`.

### Indexes
- `idx_trust_policy_decisions_project_id`: Index on `project_id` for fast lookups.
- `idx_trust_policy_decisions_trust_tier`: Index on `trust_tier` for filtering.

## Integration with `projects` Table
The `projects` table has been extended with a `trust_tier` column to store the latest assigned trust tier. This column is updated automatically by the Trust Policy Engine whenever a new decision is made.

**Column:**
- `trust_tier`: Text, the latest assigned trust tier.

## Migration
Migration `008_trust_policy_engine.sql` creates the `trust_policy_decisions` table and adds the `trust_tier` column to the `projects` table. It also populates the `trust_tier` column for existing projects based on their VPL results.
