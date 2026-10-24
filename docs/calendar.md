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

On mobile the toolbar has **Actualizar** on the left, date navigation in the middle,
and **Sin asignar** on the right. **Hoy** lives inside the date picker and closes it
after returning to the property's current day. **Nueva reserva** floats at the
bottom right; see [navigation](portal.md#navigation).

## Picker

The picker uses the existing whole-stay assignment queries, not the calendar window,
and lists only matching physical rooms available for the entire stay, sorted by room
number so neighbours sit together. Occupied and closed rooms are hidden; if none
qualify, the picker shows **Sin habitaciones disponibles**. Back or Escape returns to the list.
Dismissal and duplicate assignment are blocked while saving. A conflict retains the
selection, shows its error in the picker, and refreshes availability.

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

## Known assignment limitation

The backlog and picker admit checked-in reservations, but
[assignRoom](../apps/portal/src/lib/api.ts) currently requires `confirmed` and
rejects them with "La habitación cambió. Actualiza la reserva." This is an
application mismatch, not a domain rule prohibiting assignment after check-in.
A follow-up should align the save helper with the intended confirmed/checked-in
flow and cover a checked-in assignment through the calendar.
