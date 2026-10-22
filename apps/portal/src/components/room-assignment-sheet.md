# Mobile room assignment

The user selected prototype **C**: a bottom sheet that moves from the unassigned
reserved-room list to a physical-room picker, without selecting a calendar bar.
The complete A/B/C comparison and verdict are preserved on the local throwaway
branch `prototype/mobile-room-assignment`, commit `1581cf4`, in
`apps/portal/src/components/room-assignment-prototype.md`.

The implementation uses the existing mobile breakpoint (below 768px). The calendar
toolbar has an **Actualizar** icon button on the left, date navigation in the
middle, and a **Sin asignar** icon button on the right. **Hoy** lives inside the
date picker and closes it after returning to the property's current day. A small
primary-colored badge on the assignment button makes pending work visible. It counts
unassigned reserved rooms overlapping the displayed dates, not reservations,
available physical rooms, or a property-wide backlog. One reservation with three
unassigned reserved rooms contributes three. The badge is hidden at zero and
when no calendar data is available; cached counts remain during refreshes. The
button stays available at zero, and its accessible name includes the count.
Selecting **Sin asignar** opens the sheet; dismissing it returns focus to that
button. The calendar keeps its full width.
Desktop retains its existing toolbar, inline panel, and dashed calendar-bar assignment.

The mobile sheet follows the existing Lyra density: standard button sizes,
content-driven rows in a single bordered list with separators, compact spacing,
and the existing one-pixel focus treatment. These changes are local to the mobile
flow; shared sheet primitives and desktop styling are unchanged.

Mobile toasts appear top-center with safe-area spacing and upward entrance/exit
motion, away from the bottom-sheet controls. Desktop toasts stay bottom-right.

The picker uses the existing whole-stay assignment queries, not the calendar
window, and lists only matching physical rooms available for the entire stay.
Occupied and closed rooms are hidden; if none qualify, the picker shows
**Sin habitaciones disponibles** instead of an empty list. Back returns to the
reserved-room list; closing cancels the selection. Dismissal and duplicate assignment are blocked while
saving. A conflict retains the selection, shows its error in the sheet, and
refreshes availability. Success returns to the refreshed unassigned list.

`tests/calendar.test.ts` covers the mobile flow at the real calendar screen with
HTTP fixtures, including availability outside the visible calendar, multi-room
reservations, conflicts, pending-write dismissal, and cancellation. Phone layout,
scrolling, safe-area spacing, and touch behavior still need authenticated visual
validation on a device.
