# Backend

Run commands from the repository root using pnpm.

```sh
pnpm install
pnpm dev
```

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

Sample scenarios live in `seed-data.mjs`. Room types and rooms come from
`seed.sql`. The existing `pnpm db:seed:local` command only adds missing room types
and rooms; use `pnpm db:reset:local` to undo edits and reload all sample data.

## Deployment and Worker types

Production API: `https://pms-api.meldar.workers.dev`

Staging API: `https://staging-pms-api.meldar.workers.dev`

```sh
pnpm --filter @pms/backend run deploy
pnpm --filter @pms/backend cf-typegen
```

The deploy command applies pending migrations to `pms-production` before
deploying the `pms-api` Worker. Production starts with schema only.

The persistent `staging` branch and API feature-branch Previews use the shared
`pms-preview` database. Reset its sample data with:

```sh
pnpm --filter @pms/backend db:reset:preview
```

After a schema-baseline change, rebuild preview once with:

```sh
pnpm --filter @pms/backend db:reset:preview --rebuild-schema
```

Rebuild preview before deploying the matching backend and portal. An existing
production database also needs a deliberate rebuild or replacement before this
baseline can be deployed; the deploy script does not rebuild it.

The reset command is destructive and only targets the database declared in
`wrangler.preview-migrations.jsonc`.

For Workers Builds, use `pnpm --filter @pms/backend typecheck` as the build
command, `pnpm --filter @pms/backend run deploy:ci` as the deploy command, and
`pnpm --filter @pms/backend run deploy:preview:ci` as the Preview command. These
commands deploy code without changing either database. Apply new migrations
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
API. Pushes to the `staging` branch create or update the stable
`staging-pms-api` Preview. Other branches can still create branch-specific API
Preview deployments for direct testing. All API Previews share the
`pms-preview` database.

The Hono application uses the `Env` type from `src/env.ts`.
