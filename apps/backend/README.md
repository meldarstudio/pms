# Backend

Run commands from the repository root using Node 22.22.1 and pnpm 11.22.0.
Vite+ is installed locally for tests and task commands. Wrangler still runs
the Worker and handles deployment.

```sh
pnpm install
pnpm dev
```

Run `pnpm exec vp test --project backend` or `pnpm --filter @pms/backend test`
for the backend suite. Tests use `vite-plus/test` and in-memory SQLite; they
do not require a running Worker. Run `pnpm format` to format maintained repo files,
including the backend, with Oxfmt defaults. Generated Worker types and Drizzle
metadata are excluded. `pnpm check` checks formatting, lint rules, and native
types across the portal, backend, and shared schemas. `pnpm lint` covers all
three packages; `pnpm --filter @pms/backend lint` targets the backend. Backend
source uses Worker globals, while tests, seed scripts, and configuration use
Node globals. React and browser rules apply only to the portal.

Native type checking covers backend source, configuration, TypeScript tests,
and shared schemas. Backend `.mjs` scripts and tests receive syntax linting
without static type checking. `pnpm typecheck` runs native type checks without
formatting or lint rules. `pnpm --filter @pms/backend typecheck` retains
`tsc --noEmit` for standalone checks and Workers Builds; root commands do not
repeat that compiler pass.

## Reservation dates

Each reservation has one `checkIn` and `checkOut` date shared by all its rooms.
These dates determine the booked nights, availability, and nightly charges.
Check-in and checkout actions change the reservation status. They do not record
separate arrival or departure timestamps or change the dates. For an early
departure, save the shorter date range together with the checkout status.

## Concurrent reservation saves

The reservation workflow loads the reservation, booking contact, room lines,
nightly prices, staying guests, and payments in one D1 batch. Commands commit
against internal reservation and contact revisions. Revisions are database
details and do not appear in request or response payloads.

If another command commits first, the stale attempt rolls back its entire batch,
including its request receipt and any payment or contact writes. The workflow
reloads the current state and reapplies the original actions, with at most three
attempts. A later intentional edit wins on the same field; unrelated edits remain.
Actions that are no longer valid, such as editing a deleted payment, return their
ordinary validation error. Persistent contention returns 409 with
`reservation changed while saving; please try again`.

Booking contact edits also check the guest revision. The guest editor increments
that revision with its partial updates, so a reservation command cannot replace
concurrent guest notes with an older copy. Retrying a committed request ID still
replays the existing save without adding duplicate payments. Reusing that ID with
a different payload still returns 409.

The revision check deliberately fails the revision column's NOT NULL constraint
on a mismatch. A conditional update affecting zero rows would not abort the
remaining statements in a D1 batch. The workflow recognizes only these revision
constraint failures as retryable. Inventory conflicts retain their existing
trigger checks and error responses. The temporary `cancelled` status that permits
atomic room swaps remains inside the write transaction.

## Room validation at save time

The workflow decides which rooms need current-rule validation from the original
and proposed reservation states. Added or changed rooms, changed stay dates, and
restoration from `cancelled` or `no_show` to an inventory-holding status require
validation. Unchanged saved rooms can still accept payments, notes, discounts,
status corrections within inventory-holding statuses, and cancellation after a
room type's occupancy limit is reduced.

TypeScript preflight provides preview pricing and per-room issues. Database
triggers own the authoritative occupancy, room-type agreement, inventory, closure,
and overlap checks during writes. For restoration and changed dates, the workflow
updates each proposed room's type column to itself inside the write batch. This
runs the existing room-validity triggers even for unchanged room rows, without
rewriting their saved nightly prices. The final reservation update checks
inventory against the proposed dates and status.

The workflow bases that extra validation on the original state, before the
transaction's temporary `cancelled` release. Checking occupancy on every final
status update would reject ordinary saves of unchanged rooms. A concurrent room
type or assignment change can invalidate a successful preview or preflight; the
write then returns the existing 409 error and rolls back the entire command,
including its request receipt. Preview remains advisory and does not reserve
inventory or freeze room rules.

## Reset local dummy data

```sh
pnpm db:reset:local
```

This command applies local migrations, deletes all local application data, and
reloads the sample dataset. It leaves the database schema, triggers, and migration
history in place. It only targets local D1 and does not need a running backend.

The schema has a fresh baseline in `drizzle/0000_schema.sql` and hand-written
inventory guards in `drizzle/0001_overlap_triggers.sql`. Older databases must be
rebuilt once before using it:

```sh
pnpm db:reset:local --rebuild-schema
```

This removes PMS tables, their triggers, and the D1 migration ledger, applies the
current schema, and reloads sample data. Subsequent resets can omit the flag.
It preserves unrelated tables and Cloudflare metadata. The rebuild also supports
`--persist-to` for an isolated local database.

The dataset contains three room types, 60 rooms, 21 guests and reservations,
nightly prices and payments, rate overrides, and three room closures.
Bookings include past stays, current stays, arrivals and departures today,
upcoming stays, cancelled and no-show bookings, and multi-room bookings. Alex,
Sam, and Jamie Demo have confirmed unassigned rooms for testing manual assignment.
Room 101 has consecutive bookings that share a checkout/check-in date.

Edit bookings and closures in the portal, then run the reset again and refresh
the portal to restore the sample data. The reset removes records you added and
restores records you edited or deleted.

Dates default to today in UTC. Use a fixed reference date to get identical data
across runs:

```sh
pnpm db:reset:local --date=2026-10-06
```

For a separate local database, pass an absolute persistence directory:

```sh
pnpm db:reset:local --date=2026-10-06 --persist-to=/tmp/pms-demo
```

Use the same `--persist-to` directory when starting Wrangler if you want the
backend to read that database. Without this option, the reset uses Wrangler's
default local database, the same one used by `pnpm dev:backend`.

Sample scenarios live in `scripts/seed-data.mjs`. Room types and rooms come from
`seed.sql`. The existing `pnpm db:seed:local` command only adds missing room types
and rooms; use `pnpm db:reset:local` to undo edits and reload all sample data.

## Deployment and Worker types

Production API: `https://pms-api.meldar.workers.dev`

```sh
pnpm --filter @pms/backend run deploy
pnpm --filter @pms/backend cf-typegen
```

The deploy command applies pending migrations to `pms-production` before
deploying the `pms-api` Worker. Production starts with schema only.

`main` is the only deployed branch. Feature branches merge to `main`.
Day-to-day development uses the local D1 database and `pnpm db:reset:local`.

A consolidated baseline requires rebuilding or replacing `pms-production`
before deploying. The deploy script applies pending migrations and does not
rebuild an existing database.

For Workers Builds, use `pnpm --filter @pms/backend typecheck` as the build
command and `pnpm --filter @pms/backend run deploy:ci` as the deploy command.
`deploy:ci` deploys code without changing the database. Apply migrations
explicitly before deploying a schema change.

Under **Settings > Build > Build watch paths**, set the API Worker's include
paths to:

```text
apps/backend/*
packages/shared/*
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
```

Leave exclude paths empty. This prevents portal-only commits from deploying the
API. Production builds deploy `pms-api` against `pms-production`.

The Hono application uses the `Env` type from `src/env.ts`.
