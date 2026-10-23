# Housekeeping

Each physical room has a [housekeeping status](../GLOSSARY.md#rooms-and-availability),
**dirty** or **clean**, that records only what staff last marked. Nothing changes it
automatically: check-in, checkout, cancellation, closures, and room edits leave it as
it was. New rooms, and rooms that existed before the status was added, start clean.
Rooms store the current status and when it last changed; there is no history or record
of who marked it. Housekeepers use the shared staff login.

## Limpieza page

`/housekeeping` (**Limpieza** in the sidebar) is a phone-first list of every room for
the property date. Each row shows the room number and type, a **Sucia** or **Limpia**
badge, today's occupancy, a **Cerrada** badge when a closure covers tonight, and when
the status was last marked, in the property time zone. One button marks the room
clean or dirty.

Occupancy comes from assigned, non-cancelled stays on the property date:

- **Sale hoy**: a stay checks out today but has not been checked out.
- **Salió hoy**: a stay checked out today was checked out.
- **En casa**: a checked-in stay continues tonight.
- **Llega hoy**: a confirmed stay checks in today. A same-day turnover shows both
  the departure and the arrival.
- **Libre**: none of the above. A confirmed stay that began earlier but was never
  checked in counts as none of these.

The backend sorts dirty rooms with an arrival today first, then other dirty rooms,
then clean rooms, each by room number. Marking a room updates its row in place without
re-sorting, so the next tap never lands on a row that just moved; the order refreshes
on the next read (refresh button, window focus, or reopening the page). A rejected mark
restores the previous status and shows an error toast.

`PUT /housekeeping/:roomId` sets, rather than flips, the status, so repeated or
simultaneous taps agree; the last write wins. It records the time of every mark,
including a repeat of the current status. `GET /housekeeping` returns the list
and its property date.

## Elsewhere in the portal

- **Calendar:** a dirty room shows a small **Sucia** marker beside its number in the
  room column. The marker is display-only; mark rooms from Limpieza.
- **Check-in:** checking in a confirmed reservation from the reservation status
  select or **Hacer check-in** first reads the current statuses. If an assigned room
  is dirty, a dialog names it and offers **Volver** or **Hacer check-in**. It never
  blocks check-in; unassigned reserved rooms are not checked. If the read fails, the
  warning uses the statuses loaded with the reservation.

Reservation reads include each assigned room's `housekeepingStatus` (`null` while
unassigned), and calendar rooms include it as well. Marking a room refreshes cached
calendar and reservation reads in that browser.

Implementation: [housekeeping routes](../apps/backend/src/routes/housekeeping.ts),
[Limpieza page](../apps/portal/src/components/housekeeping.tsx), and the
[check-in warning](../apps/portal/src/components/dirty-room-check-in.tsx).
