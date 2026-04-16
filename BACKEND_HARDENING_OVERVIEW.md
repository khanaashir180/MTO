# Backend System Overview And Hardening Plan

## Current Backend Shape

The backend is an Express/PostgreSQL service under `server/src`.

- `app.js` wires the API routes, security middleware, rate limits, health checks, and versioned `/api/v1` aliases.
- `controllers/` contains the business workflows for auth, orders/MTO, production, finance, CRM, MRP, raw material store, outlets, and platform operations.
- `routes/` maps HTTP endpoints to controllers and authorization middleware.
- `middleware/auth.js` resolves users, sessions, roles, outlet/stage scope, and effective permissions.
- `config/permissions.js` is the role and permission catalog. This is the correct source for upgradeable access control.
- `db/migrations/` owns schema evolution. `scripts/backup-db.js`, `verify-backup.js`, and `restore-db.js` are the database safety loop.
- `tests/` now covers unit logic, deployment guardrails, and database-backed pilot workflows.

## Shortcut Classes Found

- Route authorization is partially modernized. Orders, finance, and CRM are permission-based, but MRP and raw store had hard-coded role lists.
- Some controllers are very large and mix validation, SQL, workflow decisions, audit, and response formatting in one file.
- Several module depth controllers use broad `SELECT *` patterns, which is convenient but fragile for long-term API contracts.
- Seed users are intentionally simple for pilot testing, but production deployment must use invite/reset flows and environment-held secrets instead of shared seeded passwords.
- Migrations are functional and CI-proven, but numbering has historical collisions from rapid sprinting. Future migrations should use a single monotonic sequence and descriptive names.
- Some modules added as feature-depth sprints are table-backed but need stronger business workflow tests before being treated as ERP-critical.

## Three Hardening Sprints

### Sprint 1: Access Control And Upgrade Boundaries

Goal: remove hard role gates and make route access governable from the permission catalog.

- Convert MRP routes from `requireRoles` to named permissions.
- Convert raw material store routes from `requireRoles` to named permissions.
- Keep existing seeded-user behavior through role permission templates.
- Add guardrail tests so these modules cannot regress back to hard-coded role lists.
- Add integration tests proving read/write permission separation for production supervisors.

Status: implemented in this sprint.

### Sprint 2: Service Boundaries And Validation

Goal: make high-risk workflows easier for a developer to extend without breaking hidden side effects.

- Extract order/customer validation and normalization out of `orderController.js`.
- Extract customer account and ledger posting helpers into reusable services.
- Centralize production flow constants so order creation and production advancement cannot drift.
- Add tests for invalid production flow, invalid customer number/country code combinations, and delivery-address changes.
- Replace broad response assumptions in the most-used endpoints with explicit field contracts.

Status: partially implemented. Production-flow rules and order/customer validation helpers are centralized and tested. Ledger/account service extraction remains for the next refactor window because it touches finance posting behavior.

### Sprint 3: Data Integrity, Audit, And Release Safety

Goal: harden production deployment and database history protection.

- Add migration guardrails for duplicate migration prefixes and non-idempotent DDL.
- Expand backup/restore CI to verify row-level recovery on key ERP tables.
- Add audit-log tests for order edits, stage transitions, recovery cases, permission changes, and finance ledger changes.
- Add route matrix tests for all seeded roles against critical modules.
- Add a release checklist that maps each deployment to migration, backup, rollback, and smoke-test steps.

## Definition Of Done For Production Readiness

- Every critical route is permission-gated, not role-hardcoded.
- Every write endpoint has validation, idempotency where appropriate, and a test proving failed writes leave no residue.
- Every money/order/stage/customer change has audit evidence.
- CI proves frontend build, migrations, backup, restore, server unit tests, database integration tests, and Railway image startup.
- Production deploys happen from tagged releases with backup taken before migration.
