# Database changes and production safety

Follow the [root production safety policy](../../AGENTS.md#safety). Local sample data can be replaced without confirmation or backups; that permission never extends to production.

## Schema and migration changes

1. Use `apps/backend/src/db/schema.ts`, application code, and tests to understand the current model. Read existing migration SQL only when needed for migration compatibility or diagnosis; keep snapshot JSON generated.
2. After editing the schema, run `pnpm db:generate` to append a migration. Preserve existing SQL, snapshots, and journal entries; do not consolidate or regenerate the deployed baseline. Review the new SQL for data loss and compatibility with existing rows.
3. For hand-written trigger changes, add a new migration rather than editing an applied file. Register it in `apps/backend/drizzle/meta/_journal.json`, preserving existing entries. Separate SQL statements with `--> statement-breakpoint` for Wrangler.
4. Run affected backend route and direct database-trigger tests and `pnpm check`. Tests execute journal entries, so an unregistered migration is not tested. For changes to an existing database, also verify the upgrade against a local database containing the previous schema and representative data; fresh-database tests alone do not prove upgrade safety.
5. Run `pnpm db:reset:local --rebuild-schema` to verify a fresh local install and sample data. Update seeds, tests, and documentation for the resulting schema. Rebuilding the local database applies existing migration files; it does not authorize rewriting those files.

Drizzle does not generate the business-rule triggers. Their original definitions are in `apps/backend/drizzle/0001_overlap_triggers.sql`; subsequent migrations must preserve or deliberately replace their capacity, overlap, assignment, closure, and staying-guest guards. Keep `rethrowConflict` and portal error translations aligned with trigger abort messages.

## Local data

Before resetting or seeding local data, read [Local sample data](../../README.md#local-sample-data) for reset/rebuild behavior, date pinning, and persistence directories.

Sample data stays local; production property setup happens through the application.

## Production release

Before a release, follow [the release checklist](../releases.md) and [safe production migrations](../releases.md#safe-production-migrations). Validate the exact release SHA before approving migrations; the workflow only checks readiness and deploys code. Get current Worker identities, database bindings, and origins from the package Wrangler configs.

- Plan for the currently deployed Worker to run during migration and for portal/API builds to arrive separately. Prefer additive, compatible changes; identify any coordinated cutover before merging.
- Preserve production records. Destructive migrations, resets, baseline replacement, or database replacement require explicit approval for the specific data loss and a recovery plan; routine release authorization is not enough.
- For a schema release, report the migration order, compatibility impact, validation performed, and recovery approach. Do not run remote commands merely to validate a local change.
