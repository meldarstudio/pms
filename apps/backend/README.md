# Backend

Hono Worker backed by Cloudflare D1. Start with the root
[setup](../../README.md#setup), [local credentials](../../README.md#signing-in),
and [commands](../../README.md#commands). Read [backend agent instructions](AGENTS.md)
before changes.

## Guides

- [Authentication](../../docs/authentication.md) for sessions, CORS, and authorized credential changes.
- [Property calendar](../../docs/property-calendar.md) for dates, timezone metadata, and transactional room-type guards.
- [Reservations](../../docs/reservations.md) for commands, previews, online quotes, reads, concurrency, and save-time validation.
- [Property setup](../../docs/property-setup.md) for atomic room numbering, ownership, and occupancy limits.
- [Calendar and assignment](../../docs/calendar.md) for the calendar read and assignment backlog.
- [Housekeeping](../../docs/housekeeping.md) for room statuses and the property-date room list.
- [Local sample data](../../docs/local-data.md) before resets or seeding.
- [Database changes](../../docs/agents/database.md) before schema, trigger, or migration changes.
- [Production releases](../../docs/releases.md) for deployment, migrations, and recovery.

## Implementation and tests

`src/index.ts` mounts routes, `src/env.ts` defines `Env`, and `wrangler.jsonc`
defines Worker identity, bindings, and deployment variables. Refresh generated
Worker types with `pnpm --filter @pms/backend cf-typegen` from the repo root.
Request schemas come from `@pms/shared`.

Colocated `.test.ts` and `.test.mjs` suites use `vite-plus/test` and apply registered
migrations to in-memory `node:sqlite` databases. They need no running Worker.
Migration CLI tests also need Python 3's standard-library PTY for terminal checks
with simulated Wrangler commands and a private home directory. Follow the root
[testing guidance](../../README.md#testing) and [policy](../../CODING_STANDARDS.md#tests).
