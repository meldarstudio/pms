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
`?view=all` opens **Todas**. Below 768px each tab is a column of cards for the
housekeeper; from 768px the same tabs show a [desktop table](#desktop-table) for the
front desk or supervisor.

Tabs and room actions use the same compact [Lyra styling](portal.md#control-styling)
on phones and desktop. Phone rows share the same padding in both tabs.

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
While a mark saves, that row's control is disabled. Rooms can also be marked dirty from
the [calendar](#elsewhere-in-the-portal).

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

### Desktop table

At 768px and wider, the breakpoint Reservas uses, each tab's rooms are a table instead
of cards, in the same order and with the same Por limpiar filter, tab count, and
**Todo limpio**. Its columns are **Habitación**, **Tipo**, **Hoy** (today's stays as
above), **Marcada**, and the tab's action: **Lista** on Por limpiar, **Sucia | Limpia**
on Todas. Each action marks its row exactly as on the phone, including the disabled
control while it saves, the **Deshacer** toast, and the restore on failure.

The **Hoy** badges stay on one line in the desktop table so switching between
the two action controls does not wrap badges and change row heights. Narrow
tables scroll horizontally; phone cards still allow badges to wrap.

**Marcada** is when the housekeeping status was last marked, from
`housekeepingChangedAt`, in the property time zone: the time (`10:42`) when it falls
on the list's property date, otherwise a short date (`23 oct`, `5 sep`) with the
portal's own Spanish month abbreviations rather than the browser's, and `—` for a room
never marked. It never shows who marked it.

### Bulk marking

The desktop table can mark several rooms in one action; the phone cards have no
selection. Each row has a checkbox, and the header's checkbox selects every visible row,
or clears the selection when any row is selected. Shift-clicking a row selects (or
clears) every row from the row clicked last to it, in the order on screen: room number
order on Todas, so 101 then shift-click 110 selects 101–110, and cleaning order on Por
limpiar.

While rooms are selected, the table header shows **N seleccionadas** and the bulk
action in place of the column headings, beside the header checkbox: **Marcar limpias**
on Por limpiar, and a **Marcar como** menu with **Limpias** and **Sucias** on Todas. A
bulk mark needs no confirmation and sends every selected room in one request, in the
order on screen, including rooms already in that status, whose Marcada time updates.
The rows change at once, as single marks do. On success the selection clears and one toast (**N
habitaciones listas** or **N habitaciones marcadas sucias**) offers **Deshacer**, which
sets each room back to its own previous status in one request; it does not restore the
old Marcada time. On failure every room returns to its previous status, an error toast
is shown, and the selection stays for a retry.

The selection belongs to the tab: switching tabs clears it. After every re-read,
including the one at property midnight and one that shows marks from another device,
it keeps only rooms still visible in the tab, and the count follows. While a bulk mark
saves, the row and header checkboxes and all desktop row actions are disabled to
prevent overlapping marks. Rooms it takes off Por limpiar stay selected until it
succeeds or fails. Controls become available again after either outcome.

## API

`PUT /housekeeping` marks rooms with `{ marks: [{ roomId, status }] }`; each row's
**Lista** and **Sucia | Limpia**, on the phone or the desktop table, the calendar's
**Marcar limpia** and **Marcar sucia**, and each one's **Deshacer** each send one mark, and a [bulk mark](#bulk-marking) and its **Deshacer**
send one mark per selected room. It sets, rather than
flips, each status, so repeated or simultaneous marks agree; the last write wins. It
saves every mark or none, with one mark time shared by the whole request, recorded
even when a mark repeats the room's current status. It returns `{ rooms: [{ id,
housekeepingStatus, housekeepingChangedAt }] }` for the marked rooms. It rejects the
whole request, saving nothing, when:

- `marks` is empty or has more than 500 entries, or a status is not `dirty` or
  `clean` (400);
- the same room appears twice (400 `duplicate room in housekeeping marks`);
- any room does not exist (404 `room not found`). Rooms are never deleted and their ids
  never change, so the existence check before the write cannot go stale.

The request schema is `housekeepingMarksSchema` in `@pms/shared`.

`GET /housekeeping` returns every room by room number with today's stays, and its
property date; the portal filters and orders Por limpiar.

## Elsewhere in the portal

- **Calendar:** a dirty room shows an outline **Sucia** badge beside its number in the
  room column; a clean room shows nothing. Each room's actions menu offers **Marcar
  limpia** on a dirty room and **Marcar sucia** on a clean one, on phones and desktop and
  during room assignment. It marks the room exactly as a single Limpieza mark does: the
  badge changes at once, a toast (**Habitación 101 lista** or **Habitación 101 marcada
  sucia**) offers **Deshacer**, and a rejected mark restores the badge with an error toast.
  While a mark or its undo saves, that room's marking item is disabled; other rooms
  remain available.
- **Room assignment:** the picker shows the same badge on a dirty room only when the
  selected stay's check-in date is the property date or earlier. The status is what staff
  marked now, so it says nothing about a room's state on a later arrival. The grid keeps
  its badge in assignment mode regardless.
- **Check-in:** moving a reservation to checked-in from any other status (confirmed,
  a checkout correction, or restoring a cancellation) first checks its assigned
  rooms. If one is dirty, a dialog names it and offers **Volver** or **Hacer
  check-in**. It uses the statuses loaded with the reservation, never blocks
  check-in, and skips unassigned reserved rooms. Restoring a cancellation still asks
  for its own confirmation afterwards.

Reservation reads include each assigned room's `housekeepingStatus` (`null` while
unassigned), and calendar rooms include it as well. Marking a room updates cached calendar windows at
once. If the mark is rejected, each window restores its own previous statuses for the
marked rooms without reverting unrelated rooms. A successful mark refreshes cached
calendar and reservation reads in that browser.

Implementation: [housekeeping routes](../apps/backend/src/routes/housekeeping.ts),
[Limpieza page](../apps/portal/src/components/housekeeping.tsx), the
[shared mark and undo](../apps/portal/src/lib/use-mark-rooms.ts), and the
[check-in warning](../apps/portal/src/components/dirty-room-check-in.tsx).
