# Calendar and room assignment

Desktop and mobile share one flow: a list of unassigned reserved rooms, then a
picker of physical rooms for the selected one. `RoomAssignmentSteps` renders both
steps; desktop shows them in an inline panel beside the calendar, and mobile (below
768px) in a bottom sheet. Staff keep a group's rooms together and use room numbers to identify floors,
so the desktop calendar remains visible beside the picker.

## Entry

Both sizes open the flow from a **Sin asignar** toolbar button with a small
primary-colored badge. It counts unassigned reserved rooms from confirmed and
checked-in reservations overlapping the displayed dates, excluding checkout on
the first displayed morning; one
reservation with three unassigned reserved rooms contributes three. The badge is
hidden at zero and when no calendar data is available; cached counts remain during
refreshes. The button stays available at zero, and its accessible name
("habitaciones reservadas sin asignar") includes the count. Closing the flow cancels
any selection and returns focus to that button. On desktop the button toggles the
panel; the calendar has its full width while the panel is closed.

On mobile the toolbar follows the shared [date navigation](portal.md#date-navigation)
layout, with **Sin asignar** on the right. **Nueva reserva** floats at the bottom
right; see [navigation](portal.md#navigation).

## Picker

The picker uses the existing whole-stay assignment queries, not the calendar window,
and lists only matching physical rooms available for the entire stay, sorted by room
number so neighbours sit together. Occupied and closed rooms are hidden; if none
qualify, the picker shows **Sin habitaciones disponibles**. Back or Escape returns to the list.
Dismissal and duplicate assignment are blocked while saving. Assignments save through
the [Reservation command module](reservations.md#reservation-command-module). A conflict
retains the selection, shows its error in the picker, and refreshes availability.

After a save, the flow continues with the same reservation's next unassigned reserved
room, listing the group's assigned rooms ("Habitación 1 → 204") for reference. When
none remain it returns to the refreshed list.

## Desktop calendar

Selecting a stay moves the calendar's start when needed. The span stays at 7 or
14 days, so long stays and their checkout morning may extend beyond the grid.
Assignment availability is still checked for the entire stay. While a stay is selected, a banner names it with
**Esc para cancelar** and a cancel button; calendar bars and night cells do not open
editors. Eligible rooms show a dashed bar that assigns like the list. Rooms of the
same type that cannot take the stay show **Ocupada** or **Cerrada** in the room
column; other room types are dimmed. Hovering or focusing a room in the picker
highlights its row and scrolls the grid to it.

The mobile sheet follows the existing Lyra density: standard button sizes,
content-driven rows in a single bordered list with separators, compact spacing, and
the one-pixel focus treatment. Mobile toasts appear top-center with safe-area
spacing, away from the sheet controls; desktop toasts stay bottom-right.

The [calendar tests](../apps/portal/tests/calendar.test.ts) cover both sizes at the real calendar screen with HTTP
fixtures, including availability outside the visible calendar, groups, conflicts,
pending-write dismissal, cancellation, and moving to a stay past the window. Visual validation requirements and prior limitations are recorded in
[operational status](operations-status.md).

## Opening day

The calendar opens on the day before the property date, so a stay checking out today
shows a full night and its checkout morning, and a checked-in stay past its checkout
stays in view. The sidebar link, the `/` redirect, links from error pages, and **Hoy**
all start there; a `from` in the URL or a date chosen in the picker becomes the
first column unchanged. [`calendarStart`](../apps/portal/src/lib/route-search.ts)
owns the rule. Today's column, from its header down, has a light primary tint behind
the bars and a primary outline on its outside edges: both sides from the header to the
last room, and the header's top. It stands out from the first column.

## Calendar read

The calendar reads rooms, stays, closures, and the assignment backlog together
through `GET /calendar` for its visible window, with no reservation bill. The
client holds seven days before and after the visible window; focus, refresh, and
a relevant save refresh data. A jump outside the held window shows loading rather
than old bars under new dates. Assignment availability and the reservation list
have separate reads. See [ADR 0001](adr/0001-calendar-is-one-read.md) for the
trade-offs.

Assigned stays and closures ending on the first displayed morning remain visible.
The assignment backlog excludes checked-out and cancelled reservations and stays
ending that morning. This differs from room inventory: checked-out reservations
retain their booked nights. Operational **Hoy** comes from
[the property calendar](property-calendar.md).

Each room includes its current [housekeeping status](housekeeping.md); dirty rooms
show a **Sucia** badge in the room column, and the room's actions menu marks it clean or
dirty. The picker shows the badge only for a stay that has begun; see
[elsewhere in the portal](housekeeping.md#elsewhere-in-the-portal).

## Assignment availability rules

[`assignment-availability.ts`](../apps/portal/src/lib/assignment-availability.ts) is the
portal's only source of [assignment availability](../GLOSSARY.md#rooms-and-availability) rules. The calendar
picker, the room assignment save, the reservation editor, and new booking all use it.
Callers pass in the reservations and room closures they have already loaded.

- Confirmed and checked-in reservations can receive a room assignment. Checked-out
  and cancelled ones cannot.
- Every reservation except a cancelled one holds its assigned rooms for its stay
  nights, including checked-out reservations.
- Stay nights and room closures use `[start, end)`, so a checkout or closure ending on
  the arrival morning does not block the room.
- The calendar ignores only the reserved room being assigned, so the group's other
  reserved rooms keep their rooms. The reservation editor ignores the whole saved
  reservation, because its stay draft replaces it.

Problems come back as typed codes with one Spanish label each. They are local portal
text, not backend errors. The save reads the reservation again just before writing
and rejects a stale target with "La habitación cambió. Actualiza la reserva.", because
the server would accept a reassignment. The backend keeps its own copy of the
confirmed/checked-in rule for the assignment backlog and its own overlap validation.
