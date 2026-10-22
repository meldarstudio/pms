# Mobile room assignment

The user selected prototype **C**: a bottom sheet that moves from the unassigned
reserved-room list to a physical-room picker, without selecting a calendar bar.
The complete A/B/C comparison and verdict are preserved on the local throwaway
branch `prototype/mobile-room-assignment`, commit `1581cf4`, in
`apps/portal/src/components/room-assignment-prototype.md`.

The implementation uses the existing mobile breakpoint (below 768px). **Sin
asignar** in the calendar toolbar opens the sheet; the calendar keeps its full
width. Desktop retains its inline panel and dashed calendar-bar assignment.

The picker uses the existing whole-stay assignment queries, not the calendar
window, and lists only matching room types. Occupied and closed rooms show their
reasons and cannot be assigned. Back returns to the reserved-room list; closing
cancels the selection. Dismissal and duplicate assignment are blocked while
saving. A conflict retains the selection, shows its error in the sheet, and
refreshes availability. Success returns to the refreshed unassigned list.

`tests/calendar.test.ts` covers the mobile flow at the real calendar screen with
HTTP fixtures, including availability outside the visible calendar, multi-room
reservations, conflicts, pending-write dismissal, and cancellation. Phone layout,
scrolling, safe-area spacing, and touch behavior still need authenticated visual
validation on a device.
