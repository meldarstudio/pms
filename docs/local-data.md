# Local sample data

```sh
pnpm db:reset:local
```

This command applies local migrations, deletes all local application data, and
reloads the sample dataset. It leaves the database schema, triggers, and migration
history in place. It only targets local D1 and does not need a running backend.

A local database with an incompatible old schema can be rebuilt from the
registered migrations:

```sh
pnpm db:reset:local --rebuild-schema
```

This removes PMS tables, their triggers, and the D1 migration ledger, applies the
current schema, and reloads sample data. Subsequent resets can omit the flag.
It preserves unrelated tables and Cloudflare metadata. The rebuild also supports
`--persist-to` for an isolated local database. It drops local accounts; create them
again with [`pnpm auth:account`](../README.md#signing-in). A plain reset keeps them.

The dataset contains three room types and **24 rooms**: 12 Estándar, 8 Superior,
and 4 Suite familiar. It generates **over 600 reservations across 90 nights**,
from 45 days before the reference date through 44 days after it. Each night is
roughly **85% booked** (80–90% after rounding), measured as reserved rooms divided
by rooms available for sale, excluding closures. Cancelled reservations do not
count toward occupancy; unassigned reserved rooms do.

The deterministic schedule respects room-type inventory, physical assignments,
and closures, including room capacity reserved for unassigned stays. It includes
nightly prices, varied payments and balances, rate overrides, three room closures,
past and current stays, arrivals and departures today, upcoming stays,
cancellations, and multi-room reservations. Alejandro, Sofía, and Javier Demo retain
confirmed unassigned rooms for testing manual assignment. Room 101 has consecutive
reservations that share a checkout/check-in date. Resetting with the same reference
date recreates the same dataset.

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

Sample scenarios live in [the seed generator](../apps/backend/scripts/seed-data.mjs). Room types and rooms come from
[the room seed](../apps/backend/seed.sql). The existing `pnpm db:seed:local` command only adds missing room types
and rooms; use `pnpm db:reset:local` to undo edits and reload all sample data.

## Choosing dates and isolated state

The seed reference defaults to UTC today; the application uses the property date.
Pass an explicit reference date when testing date-sensitive behavior. Historical
seed dates can disable new-booking actions because the application clock has moved on.

In non-interactive environments, prefix reset commands with `CI=true` for Wrangler
migration confirmation. Local resets need no Cloudflare credentials.
`pnpm db:migrate:local` applies migrations without deleting sample records.

For manual browser verification, use the normal [setup and sign-in flow](../README.md).
Use only disposable local data for mutations. If using isolated state, start Wrangler
with that same persistence directory, select unused ports, and set the portal API
URL and backend allowed origin consistently. See [portal configuration](portal.md#api-environment).
