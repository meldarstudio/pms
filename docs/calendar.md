# Calendar, property dates, and room assignment

## Property dates

`PROPERTY_TIME_ZONE` is a required IANA deployment timezone; see
[backend config](../apps/backend/wrangler.jsonc) and `.dev.vars.example`. Missing/
unsupported values return 503 from login/session/operational routes with actionable
configuration errors. There is no browser/UTC fallback or staff preference.

Business dates are timezone-free `YYYY-MM-DD` labels. UTC calendar arithmetic keeps
labels/counts nights; it does not define operational today. Event timestamps remain
UTC instants. Changing timezone converts no saved date or timestamp; historical
payment dates retain their saved labels. For example, `2026-11-01T01:00:00Z` is
October 31 in Lima; November 1 starts at `05:00:00Z`.

Each request captures one property date through retries and database writes, governing
defaults, payment future-date checks, and physical room-type-change cutoffs.
The `rooms_type_change` trigger requires server-derived `property_write_context`:
insert date, change room, remove context in **one D1 batch**, including privileged
SQL writers. D1 serializes transactions and rolls back context on failure; it is
empty between operations, not a refreshed clock. SQL owns assignment/capacity
checks. Setup renumbers owned rooms/inserts new ones, not type transfers.

### Portal dates

Login/session supplies `propertyTimeZone` before date-dependent screens mount.
Missing/invalid metadata blocks the app with a Spanish configuration error; there
is no frontend timezone variable or temporary browser-date fallback.

Defaults, badges, restrictions, payment validation, and picker today/month indicators
use this zone. The shared clock refreshes at property midnight and on focus/visibility
changes without re-sign-in. Explicit URL dates/drafts remain unchanged; new forms use
the current day. Picker adapters transfer calendar components, not instants, so
remote browsers preserve saved date labels. See [rollout compatibility](history/schema-rollouts.md).

## Entry

Desktop/mobile share an unassigned-room list followed by a whole-stay physical-room
picker (`RoomAssignmentSteps`). Desktop uses an inline panel beside the calendar;
mobile uses a sheet. Keeping the grid visible helps staff group rooms by number/floor.

The Sin asignar count measures reserved rooms, not reservations, in confirmed/
checked-in stays overlapping displayed nights. Exclude departure on the first
morning. Keep cached counts during refresh, hide without data/at zero, but leave
the action available. Dismissal clears selection and returns focus. Mobile follows
shared [date navigation](portal.md#date-navigation).

## Picker

Query assignment availability for the **entire stay**, not the visible calendar.
List matching unoccupied/unclosed rooms by number; show an empty state if none.
Back/Escape returns to the list. Block dismissal/duplicate assignment while saving.
Save through the [command module](reservations.md#reservation-command-module);
conflicts retain selection and refresh availability. After success, continue with
the reservation's next unassigned room and show its assigned rooms for reference;
when complete, return to the refreshed backlog.

## Desktop calendar

Selecting a stay moves the start as needed but retains the 7/14-day span; the stay
may extend beyond it. While selected, normal bars/cells cannot open editors.
Eligible rows can assign directly; other same-type rows explain occupied/closed,
and other types are dimmed. Picker focus highlights/scrolls to its room.

[Calendar tests](../apps/portal/tests/calendar.test.ts) cover screen interactions,
not device/layout correctness. Perform authenticated visual checks for phone touch,
scrolling/safe areas, and desktop scrolling; record actual coverage privately.

## Opening day

Default start is the day before property today so today's departures show their last
night/checkout morning. A stay due out yesterday still shows checkout; older overdue
stays fall before the grid. `calendarStart` in
[route-search.ts](../apps/portal/src/lib/route-search.ts) owns this rule for Hoy,
`/`, and fallback calendar links. Sidebar starts there until a view is remembered.
Explicit URL/picker dates become the first column unchanged. Today's column remains
visually distinguished even when it is not first.

## Calendar read

`GET /calendar` reads rooms, stays, closures, and assignment backlog together, without
bills. The client holds seven days before/after the visible window; focus, refresh,
and relevant writes refresh it. Jumping outside held dates shows loading, not old
bars under new dates. Assignment availability and reservation list reads stay
separate; [ADR 0001](adr/0001-calendar-is-one-read.md) records the trade-offs.

Assigned stays/closures ending on the first morning remain visible. Calendar stays
omit cancelled/no-show; backlog also excludes checked-out stays and first-morning
departures. Checked-out reservations nevertheless retain booked inventory nights.
Rooms include current [housekeeping status](housekeeping.md#elsewhere-in-the-portal).

## Assignment availability rules

[assignment-availability.ts](../apps/portal/src/lib/assignment-availability.ts) owns
portal assignment checks for the calendar picker and its saves. Callers supply
loaded stays/closures. Reservation creation and editors instead offer the server's
[`freeRoomIds`](property-setup.md#occupancy-and-availability); editors exclude the
saved reservation, whose draft replaces it. Only confirmed/checked-in reservations receive
assignments. Stay/closure nights use `[start, end)`, allowing same-day turnover.
The helper's current conflict predicate excludes cancelled status only; do not
treat that as a business rule for No-show/Unfulfilled, which release inventory.

Calendar assignment ignores just the selected reserved room so the group's other
assignments still conflict. Problems have local typed codes/Spanish labels, separate from
backend errors. Re-read before assignment and reject a stale target—the server could
otherwise accept a reassignment. Backend backlog and database overlap checks remain
independent and authoritative at save time.
