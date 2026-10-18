# Backend

Run commands from the repository root using Node 22.22.1 and pnpm 11.22.0.
Vite+ is installed locally for tests and task commands. Wrangler still runs
the Worker and handles deployment.

```sh
pnpm install
pnpm dev
```

Run `pnpm exec vp test --project backend` or `pnpm --filter @pms/backend test`
for the backend suite. Tests are colocated under `src` as `.test.ts` and `.test.mjs`
files. They use `vite-plus/test` and apply the migrations in `drizzle` to in-memory
`node:sqlite` databases, so they do not require a running Worker.
Run `pnpm format` to format maintained repo files,
including the backend, with Oxfmt defaults. Generated Worker types and Drizzle
metadata are excluded. `pnpm check` checks formatting, lint rules, and native
types across the portal, backend, and shared schemas. For targeted diagnostics,
run `pnpm exec vp check apps/backend` from the repository root. Backend
source uses Worker globals, while tests, seed scripts, and configuration use
Node globals. React and browser rules apply only to the portal.

Native type checking covers backend source, configuration, TypeScript tests,
and shared schemas. Backend `.mjs` scripts and tests receive syntax linting
without static type checking. `pnpm check` is the shared validation command
for local development and Workers Builds; it does not run a duplicate
`tsc --noEmit` pass. Tests remain separate.

## Staff login

Every route except `GET /` and `POST /login` requires a session cookie. There is one
shared Staff account. Its username is the `AUTH_USERNAME` var in `wrangler.jsonc`
(`hotelmanantial`, matched without regard to letter case).

- `POST /login` takes `{ username, password }`, checks the password against the
  `STAFF_PASSWORD_HASH` secret (PBKDF2-SHA256), and sets a signed `HttpOnly`,
  `SameSite=Lax` cookie that lasts 30 days and does not renew. The cookie is host-only on
  the API hostname, which is same-site with the portal. `Secure` is set on HTTPS.
- Successful login and `GET /session` return `{ username, propertyTimeZone }`.
  `POST /logout` clears the cookie.
- Logins are limited to 5 per minute per IP by the `LOGIN_LIMITER` rate limit binding.
- `ALLOWED_ORIGINS` is a comma-separated list of exact origins allowed to send
  credentialed requests. Production sets it in `wrangler.jsonc`. Local dev overrides it
  in `.dev.vars`.
- If `AUTH_USERNAME`, `STAFF_PASSWORD_HASH` or `SESSION_SECRET` is missing, the Worker
  fails closed: guarded routes and login return 401 and the Worker logs the cause.
- Sessions are stateless, so one cannot be revoked alone. Rotating `SESSION_SECRET`
  signs everyone out.

Backend tests sign in through the real login route (`src/test-support/auth.ts`) and send
the resulting cookie. They do not bypass the guard.

### Changing the password or removing someone's access

```sh
pnpm auth:hash                  # prompts twice, prints the new hash
pnpm auth:hash --session-secret # prints a new session secret
pnpm --filter @pms/backend exec wrangler secret put STAFF_PASSWORD_HASH
pnpm --filter @pms/backend exec wrangler secret put SESSION_SECRET
```

When someone leaves, change both secrets. The new password is at least 12 characters.
Tell the remaining staff the new password. Everyone signs in again.

### First deployment checklist

`main` deploys automatically, so finish these before merging the login change:

1. Set `STAFF_PASSWORD_HASH` and `SESSION_SECRET` with `wrangler secret put` as above.
2. Make sure the `hotelmanantialchurin.com` zone is on this Cloudflare account. The
   `routes` entries in each `wrangler.jsonc` attach `api.hotelmanantialchurin.com` and
   `app.hotelmanantialchurin.com` as custom domains on deploy.
3. Change the portal's Workers Builds variable `VITE_API_BASE_URL` to
   `https://api.hotelmanantialchurin.com`.
4. Merge. Check that signing in works at `https://app.hotelmanantialchurin.com`.

The API no longer has a `workers.dev` or preview URL.

## Reservation dates

### Property calendar

`PROPERTY_TIME_ZONE` is a required deployment-level IANA timezone, configured as
`America/Lima` in `wrangler.jsonc` and the local variables example. Login, session,
and operational routes report 503 with an actionable configuration error if it
is missing or unsupported. There is no browser/UTC fallback or staff preference.
The portal loads this metadata before mounting date-dependent screens.

The property date defines defaults, payment future-date validation (including
edits and previews), and room-type-change cutoffs. Each request captures one
property date, including workflow retries and the corresponding database write.
For example, `2026-11-01T01:00:00Z` is property date `2026-10-31` in Lima;
November 1 begins at `2026-11-01T05:00:00Z`.

Business dates remain timezone-free `YYYY-MM-DD` labels. UTC calendar arithmetic
is only a technique for retaining labels and counting nights, not operational
today. Event timestamps remain UTC instants. Changing the deployment timezone
does not convert any reservation, closure, rate, saved nightly price, payment,
or timestamp. Historical payments that used UTC defaults retain their saved dates.

The `rooms_type_change` trigger requires `property_write_context`. The Worker
inserts its server-derived date, updates the room, and deletes the context in one
D1 batch. D1 serializes these transactions; failed writes roll back the context
along with the room. The table is empty between operations, not a periodically
refreshed clock. All privileged SQL writers changing a physical room's type must
provide and remove context in that same transaction. SQL checks assignment and
capacity itself; preflight is not authoritative. Setup only renumbers owned rooms
and inserts new rooms; its ownership guard prevents moving rooms through Setup.

Each reservation has one `checkIn` and `checkOut` date shared by all its rooms.
These dates determine the booked nights, availability, and nightly charges.
Check-in and checkout actions change the reservation status. They do not record
separate arrival or departure timestamps or change the dates. For an early
departure, save the shorter date range together with the checkout status.

Staff may cancel a whole reservation, releasing its rooms and reducing its bill
to zero. The reservation and its payments remain recorded, with payments retained
as credit for reference. Removing an individual reserved room drops its charges
and releases its inventory while the remaining rooms keep the reservation's
status and stay dates. To release the last room, cancel the reservation.

## Property setup

`POST /setup` requires the Staff account session and saves one room type with its
room-table changes in one D1 batch. It accepts:

```json
{
  "roomTypeId": "existing-type-id",
  "name": "Doble",
  "maxAdults": 2,
  "maxChildren": 2,
  "baseRateCents": 15000,
  "rooms": [{ "id": "existing-room-id", "number": "101" }, { "number": "102" }]
}
```

Omit `roomTypeId` to create a type; omit a room's `id` to add it. Existing room IDs
must belong to the selected type and cannot be repeated. Omitted rooms are left
unchanged, not deleted. Empty room arrays are valid. Adult and child limits are
independent integers: `maxAdults` is at least 1 and `maxChildren` can be 0. Both
are hard limits for new or changed reserved rooms; there is no staff override.
Rates remain per room-night regardless of occupant counts.

The response is `{ roomType, rooms }`, including the saved type and all its rooms,
with status 201 for a new type or 200 for an edit. A conflict rolls back the entire
batch, including type edits, room-number edits, and new rooms. The existing English
error strings and `{ error: string }` responses are reused. Room-number conflicts
identify the affected submitted field in the CORS-exposed `X-Error-Field` response
header (for example, `rooms[2].number`), so the portal does not need a second
request to highlight the row. Uniqueness remains
database-enforced across the property. Saves have no revision check or retry
receipt; overlapping edits use last-write-wins.

Existing numbers are temporarily released inside the batch before applying final
numbers, allowing renumbering chains and swaps. An ownership guard aborts the
batch if a submitted room has changed type since it was loaded. This is an
integrity check, not revision-based concurrent-edit detection.

Setup does not change saved reservation prices or assignments. Existing
individual room and room-type endpoints remain available.

### Occupancy and availability

Room types, availability, and inventory responses expose `maxAdults` and
`maxChildren`, replacing the former combined `maxOccupancy` field. The limits
are checked separately: a type with limits of 2 adults and 2 children permits
that family arrangement, but not 3 adults or 3 children. Children remain part of
the reserved room's declared occupancy. No age collection or automatic age
classification is introduced.

`GET /availability?checkIn=2026-10-10&checkOut=2026-10-13&adults=3&children=0`
only returns types that can accommodate those counts **in one room**. Both count
filters are optional; without them, availability returns all requested room
types for the staff's multi-room editor. Adult filters accept integers from 1
to 100 and child filters from 0 to 100. Pricing and free-room counts are
unchanged. The endpoint still requires the Staff account session; this change
does not introduce a public guest-booking site or anonymous API.

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
restoration from `cancelled` to an inventory-holding status require
validation. Unchanged saved rooms can still accept payments, notes, discounts,
status corrections within inventory-holding statuses, and cancellation after a
room type's adult or child limit is reduced.

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
upcoming stays, cancelled reservations, and multi-room reservations. Alex,
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

Production API: `https://api.hotelmanantialchurin.com`

### Property timezone release (#23)

No production operation is authorized by implementing this change. Before merging
schema-dependent code to `main`, arrange this release explicitly:

1. Apply registered migration `0003_property_calendar.sql` using the safe production
   migration process below. It adds an empty context table and replaces only the
   room-type-change trigger; all application records and applied history remain.
2. Deploy the backend with `PROPERTY_TIME_ZONE=America/Lima`. The new Worker needs
   the migration before changing rooms. The previous Worker can serve other routes
   against the new schema, but **physical room-type changes fail closed** without
   context (the old Worker may return a generic 500). Pause those changes during
   the migration/backend handoff; do not weaken the trigger for compatibility.
3. Deliver the portal after the backend. Old portals ignore the additive session
   field, but retain incorrect browser/UTC defaults, so reload open staff tabs and
   avoid date entry in the delivery gap. The new portal deliberately blocks on
   old backend metadata without a timezone. Existing session cookies remain valid.
4. Smoke-check login/session metadata, October/November date labels, backdated
   payments, future-date rejection, room-type assignment/capacity conflicts, and
   date pickers from a remote browser. Local validation includes fresh and populated
   upgrades, transactional rollback, DST cases, and opposite-side browser zones;
   it does not prove production rollout behavior.

For recovery, retain the additive table, new guard, and migration history. Prefer
a forward Worker repair. Rolling back the Worker alone makes physical room-type
changes unavailable but keeps the guard fail-closed. An old portal may be served
temporarily with a warning that its operational defaults remain wrong; never
rewrite saved dates or restore an old database to reverse this correction.

### Separate occupancy limits release

Apply `0002_room_occupancy.sql` before deploying the backend that reads
`max_children`. It adds that column with a default of 2 and replaces only the
two room-validity triggers. Existing capacity values become adult limits;
the SQL column remains named `max_occupancy` to avoid a destructive rename.
Existing room types, reservations, payments, and saved nightly prices are
preserved. Both limits can then be changed per type in Setup.

The API contract changes from `maxOccupancy` to `maxAdults` and `maxChildren`.
Coordinate the backend and portal release: apply the migration, deploy the
backend, then deploy the portal and reload open staff sessions. Old portals
cannot edit Setup against the new API. Before the backend update, the previous
Worker can run against the additive schema but retains its combined-count
preflight, and the new database child limit can reject children above 2.
An old Worker is therefore not a fully compatible client of the new policy.

For recovery, retain the additive column and applied migration history; roll
back application builds together if necessary. A previous build uses the old,
more restrictive combined-count behavior, so reservations created under the
new policy may need staff attention before changing their rooms. Do not drop
the child column or restore the old triggers underneath the new Worker.
No remote migration or deployment is part of local validation.

### Safe production migrations

Run from the repository root in an interactive terminal, with Cloudflare access
already configured:

```sh
pnpm --filter @pms/backend run db:migrate:remote
```

This production-only command never deploys code. It:

1. Reads the target binding from `wrangler.jsonc` and queries the existing migration
   ledger without creating or repairing it. Missing, empty, unknown, or
   nonsequential history stops the run. SQL files must match the Drizzle journal.
2. Shows pending SQL, its checksums, the database name and ID, and the downtime
   warning. Review compatibility with the currently deployed Worker and all
   existing records. Type `pms-production` to approve the displayed work. There is
   no `--yes` bypass; CI and noninteractive execution are refused. With no pending
   migrations, it exits without prompting or exporting.
3. Exports SQL to a unique directory under `~/.pms-production-backups/`. The
   directory is private and files are owner-only from creation. Exporting
   interrupts database access; applying migrations may also interrupt requests.
   Choose an appropriate window before approving. Failed or empty exports block
   migration. A completed export receives a SHA-256 checksum in `report.json`;
   this is **not a restore-tested backup**.
4. Applies one approved migration at a time from private copies, checking the
   local files and remote history before each apply. A file or history change
   stops the run. Each migration must exit successfully and appear in a fresh
   ledger query before the next begins.
5. Reports the observed result and retains a private `report.json` with the target,
   migration and backup checksums, and sanitized diagnostics. Wrangler disk logs
   are disabled and child-output URLs are redacted so signed export links are not
   retained. Backups and reports remain until you explicitly delete them.

The command holds `~/.pms-production-backups/migration.lock` during the run. This
only excludes cooperating runs under the same home directory. Coordinate **one
operator at a time**, including other machines and direct Wrangler commands;
the lock is not distributed. If a crash leaves a lock, inspect its PID, host, and
start time and confirm no migration is running before removing that specific file.
Existing backup directories must be owned by the operator with mode `0700`.

On failure, stop and inspect the report. Earlier migrations may have committed.
The report lists newly observed ledger entries when postflight succeeds; an
`unknown` outcome means the command could not establish the final state. An
interrupted report still marked `applying` also needs investigation. Do not rerun
blindly: reconcile the live ledger first. There is no automatic migration retry,
restore, history repair, or database reset. Destructive changes need explicit
approval for their specific data loss and a separate recovery plan. A restore can
overwrite reservations or payments saved since the export and requires its own
authorization. Keep schema and applied history when rolling back application
builds where compatible; prepare a reviewed forward repair when needed.

Local validation does not prove remote locking, outage duration, restoration, or
application correctness. Perform the release's application smoke checks separately.

### Commands and build setup

```sh
pnpm --filter @pms/backend run db:migrate:remote
pnpm --filter @pms/backend run deploy
pnpm --filter @pms/backend cf-typegen
```

**Both `deploy` and `deploy:ci` now deploy code only.** They do not apply
migrations. For a schema release, run the safe migration command above before
deploying `pms-api` or merging schema-dependent code to `main`.

`main` is the only deployed branch. Feature branches merge to `main`.
Day-to-day development uses the local D1 database and `pnpm db:reset:local`.

Preserve the existing production baseline, records, and migration ledger. A
history mismatch needs investigation and a data-preserving upgrade plan, not a
production rebuild. New-database bootstrap is outside the safe wrapper's scope.

For Workers Builds, use `pnpm check` as the build
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
