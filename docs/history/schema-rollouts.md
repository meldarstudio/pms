# Historical schema rollout constraints

Compatibility/recovery notes, **not proof of deployed migrations or builds**. Use
[releases](../releases.md) for current procedure and [dated reports](../releases.md#recorded-reports)
for recorded evidence. The migration command applies every pending migration in its
checkout; review all applicable transitions together.

Unless noted, each migration is additive: apply before code that reads new fields/
tables, deliver API before portal, preserve schema/applied history for recovery, and
roll application builds back together only when compatible. These defaults do not
authorize an operation or prove a previous Worker understands newly recorded data.

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

Creates `payment_attempts` and nullable provider IDs on payments/refunds; existing
records remain manual. Changes no rows/triggers. New reservation reads and minute
cron require it; old inserts leave provider IDs null. No route creates attempts
and portal sends no Culqi refunds at this stage. With no key, cron only expires
stale reviews (a no-op without attempts); no secret is needed while Culqi is unused.
Rolling code back also stops cron.

## Online quotes, migration 0012

Creates `quotes` and nullable unique `reservations.quote_id`. Existing reservations
have no quote; no rows/triggers change and no route creates quotes at this stage.
New reads require the column; old inserts leave it null.

## Free-cancellation days, migration 0011

Adds `free_cancellation_days` default 2, rewrites days as old hours / 24, and cuts
recorded `free_until` instants to dates. Previously accepted terms were 48 hours or
null, so conversion is exact; 15:00 property deadlines had matching UTC/property
dates. Applying `0006`–`0011` together finds no cancellation records to convert.
Keep old hours/check-in-time columns: new code still writes them for previous
Workers. Old inserts receive 48 hours/2 days; no triggers change. Recovery retains
converted values and columns.

## Night price breakdown, migration 0010

Adds zero-default adjustment/discount cents to saved nights. Old nights/inserts read
as ordinary rates; no rows or existing rule triggers change. New insert/update
guards reject negative final price/discount; saved rows are not revalidated.
Old request schemas reject negatives, but **an old Worker repricing a Non-refundable
night leaves its stored adjustment stale**. Preserve columns/guards/history.

## Refunds, migration 0009

Adds `refunds` with complete-state checks, changing no existing rows/tables/triggers.
Old Workers ignore refunds: they permit payment edits (FK still blocks deletion),
restore refunded reservations, and count refunded money as retained. Recovery
keeps refund history for new code's return; old portal ignores new fields.

## No-show outcome, migration 0008

Adds cancellation `outcome` default cancelled; existing records retain their charges/
waivers/restoration. No other row/trigger changes; inventory triggers already release
statuses outside confirmed/checked-in/checked-out. Portal had no No-show action at
this transition. **An old Worker releases No-show inventory but bills it as active.**

## Cancellation charges, migration 0007

Adds cancellation/waiver tables and one-active-cancellation unique index; no existing
rows/tables/triggers change. Prior cancelled stays retain zero charges. Old Workers
record no charge history, so their cancellations remain zero-charge. Old portal
ignores new response fields; retain tables/history for recovery.

## Rate-plan terms, migration 0006

Adds six reservation columns with Flexible defaults; no dates, rooms, prices,
discounts, payments, status, records, or triggers change. Old inserts receive Flexible
terms. Old portal ignores added fields; new portal expects terms/scheduled amounts.

## Property timezone, migration 0003

Adds empty write-context table and replaces only room-type-change trigger; retains
all records/history. New code requires it before room changes. Old Worker otherwise
runs but **physical type changes fail closed** without context (possibly generic 500).
Pause these changes during migration/API handoff; never weaken the guard.

Deploy with `PROPERTY_TIME_ZONE=America/Lima`. Old portal ignores session timezone
but keeps wrong browser/UTC defaults; reload staff tabs and avoid date entry in the
gap. New portal blocks on missing timezone; existing cookies remain valid. Check
login metadata, date labels from remote browser zones, backdated/future payments,
and assignment/capacity conflicts. Local fresh/populated upgrades, rollback, DST,
and opposite browser zones do not prove production behavior.

Prefer forward repair. Old Worker rollback leaves physical type changes unavailable
but fail-closed; old portal needs a warning about wrong operational defaults. Never
rewrite dates or restore an old DB to reverse this correction.

## Separate occupancy limits, migration 0002

Adds `max_children` default 2 and replaces two room-validity triggers. Existing
capacity becomes adult limit; SQL retains `max_occupancy` to avoid destructive rename.
Preserve room types, reservations, payments, prices. API changes `maxOccupancy` to
`maxAdults`/`maxChildren`: coordinate migration, API, portal, and staff-tab reload.
Old portal cannot edit Setup against new API.

Old Worker runs on the additive schema but still checks combined counts; DB child
limits may reject more than 2. It is not fully policy-compatible. Recovery retains
the child column/new guards/history and rolls builds together; stays accepted under
new rules may need attention before an old Worker changes them. No remote operation
is implied by local validation.
