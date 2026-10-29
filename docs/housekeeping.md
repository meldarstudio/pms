# Housekeeping

Each physical room's [housekeeping status](../GLOSSARY.md#rooms-and-availability)
is dirty/clean as last marked by staff. Reservation lifecycle, closures, and room
edits never change it. New/preexisting rooms start clean. Store current status and
last-change time, not history or who marked it; staff share a login.

## Limpieza page

`/housekeeping` uses the property date, defaulting to **Por limpiar**; `?view=all`
selects **Todas**. Phone cards and desktop tables share rules/actions and
[Lyra controls](portal.md#control-styling).

Por limpiar contains dirty rooms free tonight. Exclude a checked-in guest staying
tonight and a closure tonight unless an arrival is due today. Reinclude rooms when
the guest leaves/closure ends. Order by arrivals to free rooms, arrivals with today's
departure, other free rooms, then other rooms with today's departure; within groups,
sort room numbers. Re-reading can reorder a room after checkout.

Todas contains every room by number. Today's assigned confirmed/checked-in stays show:

- **Sale hoy:** checked-in departure today.
- **En casa:** checked-in guest continues tonight.
- **Llega hoy:** confirmed arrival today; turnover shows arrival and departure.
- **Libre:** no guest in the room now, including one already checked out today;
  can coexist with arrival/closure. A never-checked-in confirmed stay is none of
  these occupancy states, even on its final day.

Closures covering tonight add **Cerrada**. Last-marked time uses the list's property
date/timezone: time for today, short Spanish date otherwise, dash if never marked.
Re-read at property midnight; retain the previous list until success, including failure.

### Marking and undo

Marks optimistically set status, with row controls disabled while pending. Success
refreshes and offers undo; failure restores status and shows an error. Re-selecting
an already pressed single-row status sends nothing. Por limpiar's clean action removes
the room after marking.

Desktop alone supports checkbox/range selection in current display order. Header
selection selects all visible rows or clears an existing selection. Bulk marks send
every selected room in display order, even rooms already in the target status.
Success clears selection and offers one undo restoring each previous status—not
its old mark time. Failure restores all statuses and keeps selection for retry.

Switching tabs clears selection; re-reads prune rooms no longer visible. During a
bulk save disable all row actions/selection, retaining selected rooms temporarily
removed from Por limpiar until success/failure.

## API

`PUT /housekeeping` takes `housekeepingMarksSchema` in `@pms/shared`: a nonempty
list of up to 500 unique room IDs with dirty/clean status. Set, don't flip: last
write wins. Save all or none with one timestamp, including repeated same-status
marks. Reject duplicate IDs (400) or any missing room (404), changing nothing.
Rooms are not deleted and IDs do not change, so existence cannot go stale before write.

Return marked room IDs/statuses/times. `GET /housekeeping` returns every room by
number, today's stays, and property date; Por limpiar filtering/order is portal-local.

## Elsewhere in the portal

- Calendar shows a dirty badge and clean/dirty actions, including assignment mode.
  Each uses the same optimistic mark/undo. Disable only that room's action while
  marking/undoing; other rooms remain usable.
- The assignment picker shows dirty status only for check-in today or earlier;
  current cleanliness says nothing about a future arrival. The grid keeps its badge.
- Entering checked-in from any other status warns about assigned dirty rooms, using
  loaded statuses, but **never blocks check-in**. Skip unassigned rooms. Restoration
  still requires its separate confirmation after this warning.

Reservation/calendar reads include housekeeping status (null for unassigned rooms).
Marks optimistically update cached calendar windows; failure restores each window's
own previous marked-room statuses without reverting unrelated rooms. Success
refreshes calendar/reservation reads in that browser.

Implementation: [routes](../apps/backend/src/routes/housekeeping.ts),
[page](../apps/portal/src/components/housekeeping.tsx),
[shared mark/undo](../apps/portal/src/lib/use-mark-rooms.ts), and
[check-in warning](../apps/portal/src/components/dirty-room-check-in.tsx).
