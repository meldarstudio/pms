# Historical schema rollout constraints

These notes preserve compatibility and recovery reasoning for the original
transitions. They do not establish which migrations or builds are live. See
[operational status](../operations-status.md) for recorded evidence and
[releases](../releases.md) for the current procedure.

The safe migration command applies every pending migration in the selected
checkout. Starting before `0002` with a checkout containing `0003` requires
reviewing both sets of constraints together. Do not treat either section as a
command to apply only one migration.

## Future-stay coupons, migration 0014

`0014_coupons.sql` creates `coupons` and `coupon_movements`. It alters no existing
row or trigger, and existing reservations have no coupon activity. Apply it before
deploying the backend that reads those tables: the new Worker's reservation reads,
commands, and `GET /payments` fail without them. The previous Worker runs against
the additive schema and ignores the tables. The portal only gains types, so its
order does not matter. For recovery, keep the tables and applied history. Once a
coupon is issued or redeemed, do not roll the backend back: the previous Worker
ignores coupon movements, so value converted to a coupon would read as refund due
again and redeemed value as owed.

## Culqi payments, migration 0013

`0013_culqi_payments.sql` creates `payment_attempts` and adds nullable
`culqi_charge_id` to `payments` and `refunds` and `culqi_refund_id` to `refunds`.
Existing payments and refunds read as manual records. It alters no existing row or
trigger. Apply it before deploying the backend that reads those columns: the new
Worker's reservation reads and its per-minute cron fail without them. The previous
Worker runs against the additive schema, and its inserts leave the Culqi columns null.

No route creates payment attempts, and the portal sends no `request-culqi-refund`,
so the release needs no `CULQI_SECRET_KEY` while Culqi stays unused. Without the
secret the cron only expires stale reviews, a no-op with no attempts. Deliver the
portal after the backend. For recovery, keep the table, columns, and applied
history and roll application builds back together; rolling back also stops the cron.

## Online quotes, migration 0012

`0012_quotes.sql` creates `quotes` and adds a nullable, uniquely indexed
`reservations.quote_id` referencing it. Existing reservations have no quote. It
alters no existing row or trigger. Apply it before deploying the backend that reads
the column: the new Worker's reservation reads fail without it. The previous Worker
runs against the additive schema, and its inserts leave `quote_id` null. No route
creates quotes yet. For recovery, keep the table, column, and applied history.

## Free-cancellation days, migration 0011

`0011_free_cancellation_days.sql` adds `reservations.free_cancellation_days` with
default 2, then rewrites existing rows: `free_cancellation_days` becomes
`free_cancellation_hours / 24`, and each recorded `reservation_cancellations.free_until`
instant is cut to its date. Before `0011` the only accepted terms were 48 hours
(Flexible) or null, so every converted value is exact; deadlines were 15:00 in the
property timezone, so their UTC date is the property date. When `0006` through
`0011` apply together, no cancellation records exist yet and the second update
changes nothing. It changes no trigger and keeps `free_cancellation_hours` and
`check_in_time`. The new Worker still writes them, so a previous Worker reads its
reservations correctly.

Apply it before deploying the backend that reads the column: the new Worker's
reservation reads fail without it. The previous Worker runs against the schema, and
its inserts receive 48 hours and 2 days. For recovery, keep the column, converted
values, and applied history and roll application builds back together.

## Night price breakdown, migration 0010

`0010_night_price_breakdown.sql` adds `adjustment_cents` and `discount_cents`
(default 0) to `reservation_room_nights`, so every existing night reads as its
ordinary rate with no adjustment or discount. It adds insert and update triggers
rejecting a negative `price_cents` or `discount_cents` as `invalid night price`,
and changes no existing row or business-rule trigger. Saved rows are not
revalidated. Apply it before deploying the backend that reads those columns: the
new Worker's reservation reads fail without them. The previous Worker runs against
the schema. Its request schemas already reject negative prices, and its night inserts
receive zero defaults.

For recovery, keep the columns, triggers, and applied history and roll application
builds back together. A previous Worker that reprices a Non-refundable night
rewrites `price_cents` without its adjustment and leaves the stored adjustment stale.

## Refunds, migration 0009

`0009_refunds.sql` creates `refunds` with checks that keep each requested,
completed, or failed record complete. It alters no existing table, row, or
trigger, so existing payments, charges, and balances read unchanged. Apply it
before deploying the backend that reads the table: the new Worker's reservation
reads fail without it. The previous Worker runs against the additive schema but
does not see refunds: it lets staff edit a payment with refunds (the foreign key
still blocks deleting it), restores a reservation with refunds, and bills
completed refunds as money still retained.

Deliver the portal after the backend. Old portals ignore the added response
fields. For recovery, keep the table and applied history and roll application
builds back together; refunds recorded by the new Worker remain for its return.

## No-show outcome, migration 0008

`0008_no_show_outcome.sql` adds `outcome` to `reservation_cancellations` with
default `cancelled`, so every existing record reads as a cancellation with its
charge, waivers, and restoration unchanged. It alters no other table, row, or
trigger; the triggers already release inventory for any status outside confirmed,
checked in, and checked out. Apply it before deploying the backend that reads the
column: the new Worker's reservation reads fail without it. The previous Worker
runs against the additive schema, and its inserts receive the default.

The portal has no No-show control yet, so no reservation becomes `no_show` until a
caller sends that status. Deliver the portal after the backend. For recovery, keep
the column and applied history and roll application builds back together; a
previous Worker treats a `no_show` reservation as releasing inventory but bills it
as an active stay.

## Cancellation charges, migration 0007

`0007_cancellation_charges.sql` creates `reservation_cancellations` and
`cancellation_waivers`. It alters no existing table, row, or trigger. Existing
cancelled reservations get no cancellation record and keep a zero charge. A partial
unique index allows one active (unrestored) cancellation per reservation. Apply it
before deploying the backend that reads those tables: the new Worker's reservation
reads fail without them. The previous Worker runs against the additive schema but
writes no cancellation records, so cancellations it records keep a zero charge.

Deliver the portal after the backend. Old portals ignore the added response fields.
For recovery, keep the tables and applied history and roll application builds back
together.

## Rate-plan terms, migration 0006

`0006_rate_plan_terms.sql` adds six columns with defaults to `reservations`, so
every existing reservation reads as Flexible. It changes no dates, rooms, nights,
saved prices, discounts, payments, statuses, or cancellation records, and leaves
the triggers unchanged. Apply it before deploying the backend that reads those
columns: the new Worker's reservation reads fail without them. The previous Worker
runs against the additive schema, and its inserts receive Flexible defaults.

Deliver the portal after the backend. Old portals ignore the added response fields;
the new portal expects `ratePlan` and the scheduled amounts. For recovery, keep the
columns and applied history and roll application builds back together.

## Property timezone, migration 0003

For the original transition from a schema already containing `0002`, the
compatibility requirements were:

1. Apply registered migration `0003_property_calendar.sql` using the [safe production
   migration process](../releases.md#safe-production-migrations). It adds an empty context table and replaces only the
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

## Separate occupancy limits, migration 0002

For the original transition from `0001`, apply `0002_room_occupancy.sql` before deploying the backend that reads
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
