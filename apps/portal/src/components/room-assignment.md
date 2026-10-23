# Room assignment

Desktop and mobile share one flow: a list of unassigned reserved rooms, then a
picker of physical rooms for the selected one. `RoomAssignmentSteps` renders both
steps; desktop shows them in an inline panel beside the calendar, and mobile (below
768px) in a bottom sheet. Mobile came first, from prototype **C** on the local
throwaway branch `prototype/mobile-room-assignment`, commit `1581cf4`. Desktop
adopted it because staff choose rooms carefully: they keep a group's rooms together
and read floors from room numbers, so the calendar stays visible as context instead
of being the only place to click.

## Entry

Both sizes open the flow from a **Sin asignar** toolbar button with a small
primary-colored badge. It counts unassigned reserved rooms overlapping the displayed
dates, not reservations, available physical rooms, or a property-wide backlog; one
reservation with three unassigned reserved rooms contributes three. The badge is
hidden at zero and when no calendar data is available; cached counts remain during
refreshes. The button stays available at zero, and its accessible name
("habitaciones reservadas sin asignar") includes the count. Closing the flow cancels
any selection and returns focus to that button. On desktop the button toggles the
panel; the calendar has its full width while the panel is closed.

On mobile the toolbar has **Actualizar** on the left, date navigation in the middle,
and **Sin asignar** on the right. **Hoy** lives inside the date picker and closes it
after returning to the property's current day.

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

Selecting a stay moves the calendar's dates when needed so the whole stay, checkout
morning included, is visible. While a stay is selected, a banner names it with
**Esc para cancelar** and a cancel button; calendar bars and night cells do not open
editors. Eligible rooms show a dashed bar that assigns like the list. Rooms of the
same type that cannot take the stay show **Ocupada** or **Cerrada** in the room
column; other room types are dimmed. Hovering or focusing a room in the picker
highlights its row and scrolls the grid to it.

The mobile sheet follows the existing Lyra density: standard button sizes,
content-driven rows in a single bordered list with separators, compact spacing, and
the one-pixel focus treatment. Mobile toasts appear top-center with safe-area
spacing, away from the sheet controls; desktop toasts stay bottom-right.

`tests/calendar.test.ts` covers both sizes at the real calendar screen with HTTP
fixtures, including availability outside the visible calendar, groups, conflicts,
pending-write dismissal, cancellation, and moving to a stay past the window. Phone
layout, scrolling, safe-area spacing, touch behavior, and desktop row scrolling still
need authenticated visual validation.
