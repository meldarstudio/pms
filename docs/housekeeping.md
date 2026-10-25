# Housekeeping

Each physical room has a [housekeeping status](../GLOSSARY.md#rooms-and-availability),
**dirty** or **clean**, that records only what staff last marked. Nothing changes it
automatically: check-in, checkout, cancellation, closures, and room edits leave it as
it was. New rooms, and rooms that existed before the status was added, start clean.
Rooms store the current status and when it last changed; there is no history or record
of who marked it. Housekeepers use the shared staff login.

## Limpieza page

`/housekeeping` (**Limpieza** in the sidebar) is a phone-first page with two tabs for
the property date. The tab is kept in the URL; **Por limpiar** opens by default and
`?view=all` opens **Todas**.

**Por limpiar** is the housekeeper's work for today, with its count in the tab,
highlighted while rooms remain. It lists dirty rooms that will be free tonight. It
leaves out a room whose checked-in guest stays tonight, because the guest is using it,
and a room closed tonight unless a guest arrives today; each returns on its own once
the guest leaves or the closure ends.
Each card shows the room number, its type, and today's stays as listed below. Cards
run in four groups, each by room number: arrivals to a free room, arrivals to a room
whose guest leaves today, other free rooms, then other rooms whose guest leaves today. The order follows each re-read, so a card moves when a guest
checks out. Its one button, **Lista**, marks the room clean and removes it from the
tab. When none are left, the tab shows **Todo limpio**.

**Todas** is the whole hotel by room number: every room with its number, type, and
today's stays, and a **Sucia | Limpia** control whose pressed side is the current
status. Tapping the other side marks the room; tapping the pressed side does nothing.
While a mark saves, that row's control is disabled. Rooms are marked dirty only here.

Both tabs show today's stays the same way, from assigned confirmed and checked-in stays
on the property date, plus **Cerrada** when a closure covers tonight:

- **Sale hoy**: a checked-in stay checks out today.
- **En casa**: a checked-in stay continues tonight.
- **Llega hoy**: a confirmed stay checks in today. A same-day turnover shows both
  the departure and the arrival.
- **Libre**: no guest is in the room now, so someone can go in. It appears beside
  **Llega hoy** or **Cerrada** and includes a room whose guest has already checked
  out today. A
  confirmed stay that was never checked in counts as none of these, even on its
  last day.

Marking a room updates it at once and needs no confirmation; when the save succeeds, a
toast offers **Deshacer**, which sets the previous status again, and the page re-reads
the list. A rejected mark restores the previous status and shows an error toast. An
open page re-reads the list at property midnight; until that read returns, or if it
fails, it keeps showing the previous list.

`PUT /housekeeping/:roomId` sets, rather than flips, the status, so repeated or
simultaneous taps agree; the last write wins. It records the time of every mark,
including a repeat of the current status. `GET /housekeeping` returns every room by
room number with today's stays, and its property date; the portal filters and orders
Por limpiar.

## Elsewhere in the portal

- **Calendar:** a dirty room shows a small **Sucia** marker beside its number in the
  room column. The marker is display-only; mark rooms from Limpieza.
- **Check-in:** moving a reservation to checked-in from any other status (confirmed,
  a checkout correction, or restoring a cancellation) first checks its assigned
  rooms. If one is dirty, a dialog names it and offers **Volver** or **Hacer
  check-in**. It uses the statuses loaded with the reservation, never blocks
  check-in, and skips unassigned reserved rooms. Restoring a cancellation still asks
  for its own confirmation afterwards.

Reservation reads include each assigned room's `housekeepingStatus` (`null` while
unassigned), and calendar rooms include it as well. Marking a room refreshes cached
calendar and reservation reads in that browser.

Implementation: [housekeeping routes](../apps/backend/src/routes/housekeeping.ts),
[Limpieza page](../apps/portal/src/components/housekeeping.tsx), and the
[check-in warning](../apps/portal/src/components/dirty-room-check-in.tsx).
