# Property calendar

`PROPERTY_TIME_ZONE` is a required deployment-level IANA timezone, configured as
`America/Lima` in [the backend config](../apps/backend/wrangler.jsonc) and the local variables example. Login, session,
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

## Portal dates

The authenticated login/session response supplies `propertyTimeZone`; there is no
frontend timezone environment variable. Missing or invalid metadata blocks the
app with an actionable Spanish configuration error rather than briefly using
browser or UTC dates. A compatible backend must supply the metadata before the
portal can mount date-dependent screens.

Operational defaults, arrival badges, booking restrictions, payment validation,
and picker today/month indicators use that timezone. A shared clock refreshes at
property midnight and on focus/visibility changes, without signing in again.
Explicit URL dates and form drafts stay unchanged; new forms use the current day.
The picker adapter transfers calendar components into and out of zoned picker
Dates, not instants. Existing date labels remain identical in remote browsers.
UTC date arithmetic elsewhere counts nights or preserves labels only.

See [historical schema rollout constraints](history/schema-rollouts.md) for old/new
Worker compatibility, and [releases](releases.md) for the current procedure.
