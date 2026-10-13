# Calendar

The calendar shows rooms as rows and nights as columns so reception can move the visible range and open a stay or an empty night.

## Sub-features

- `calendar-range` moves by one day or one period and jumps to today.
- `calendar-open-stay` opens an existing reservation from its bar.
- `calendar-empty-night` opens a new reservation for one room and night.
- `calendar-unassigned` shows stays that have no room.

## How to get to it (user POV)

- Choose the `Calendario` tab.
- Open `http://127.0.0.1:5179/calendar?from=2026-10-13&span=7`.

## Driving it with verify-pms

Preconditions:

- Doctor prints `"ok": true`.
- The visible range starts at `2026-10-13` with span 7.

- **Show the week.** Open `http://127.0.0.1:5179/calendar?from=2026-10-13&span=7`. Room `101` is visible. The date button shows `13 oct 2026`.
- **Step one day.** Choose the button named `Día siguiente`. The URL `from` becomes `2026-10-14`.
- **Return.** Choose `Hoy` only when the machine's local today is the anchor; otherwise choose `Día anterior` once. The URL `from` is `2026-10-13` again.
- **Open a stay.** Choose a button whose name starts with `Editar reserva de`. The dialog or the reservation page shows that guest.
- **Empty night.** Choose a button whose name matches `Nueva reserva para habitación 120 el 13 oct 2026` when that night is empty. The dialog title is `Nueva reserva` and `Hab.` shows `120`. Close it without saving.
- **Unassigned.** Choose `Sin asignar`. The region named `Reservas sin asignar` is visible.
- **Proof.** Save a snapshot and screenshot of the week that includes room `101` under `.cursor/skills/verify-pms/artifacts/calendar/`.

## Gotchas

- `Hoy` uses the browser's local calendar date. The seed anchor is UTC `2026-10-13`. Do not assert that `Hoy` lands on the anchor unless those dates match.
- Date labels use Spanish short months, for example `13 oct 2026`.
- Span choices are `7 días` and `14 días` in the combobox at the start of the toolbar.
- A stay bar and an empty-night button can occupy the same room row. Read the accessible name before clicking.
- Room `110` is closed across the anchor (`Reparación del baño`). That cell is a closure, not an empty night.
