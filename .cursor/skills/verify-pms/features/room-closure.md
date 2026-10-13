# Room closure

Room closure blocks a room for a date range so it cannot be assigned and no longer counts as free inventory.

## Sub-features

- `closure-open` opens the closure dialog from a room's actions.
- `closure-save` stores a reason and a half-open date range.
- `closure-visible` shows the block on the calendar after save.

## How to get to it (user POV)

- On Calendario, choose `Acciones de habitación <number>`, then `Cerrar habitación`.
- Choose an existing closure on the calendar to edit it. Seeded closures include room `110` (`Reparación del baño`), `210`, and `310`.

## Driving it with verify-pms

Preconditions:

- Doctor prints `"ok": true`.
- Room `115` has no closure in the sample set. Use `115` for a new closure so the proof does not depend on editing `110`.

- **Open the dialog.** Go to `http://127.0.0.1:5179/calendar?from=2026-10-13&span=7`. Choose the button named `Acciones de habitación 115`, then the menu item `Cerrar habitación`. The dialog title is `Cerrar habitación` and the description includes `115`.
- **Set the range.** Set `Desde` to `2026-10-20` and `Reapertura` to `2026-10-22`. Fill the textbox named `Motivo` with `Verificación de cierre`. The description mentions `2 noches cerradas`.
- **Save.** Choose the submit button named `Cerrar habitación`. The dialog closes.
- **Confirm on the calendar.** Room `115` shows the closure across 20 and 21 October, and the night of 22 is not part of the block.
- **Proof.** Save the snapshot and screenshot under `.cursor/skills/verify-pms/artifacts/room-closure/`. If the closure is missing from the calendar, the journey failed even if the dialog closed.

## Gotchas

- The range is half-open. `Reapertura` is the first morning the room is free again. A two-night closure from the 20th reopens on the 22nd.
- The submit button and the menu item share the name `Cerrar habitación`. Choose the menu item first, then the submit button inside the dialog.
- Closures cannot overlap an assigned stay or another closure. Room `101` has back-to-back bookings; prefer `115`.
- `Cancelar` discards the draft. `Eliminar` exists only when editing an existing closure.
- A closed dialog without a bar on the calendar is not proof.
