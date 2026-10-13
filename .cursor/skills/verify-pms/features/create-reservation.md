# Create a reservation

Create a reservation lets reception enter a guest name, dates, and room type, then save a stay that shows up on the reservation page and in search.

## Sub-features

- `create-from-list` opens a blank dialog from Reservas.
- `create-from-calendar` opens the same dialog for a specific room and night.
- `create-save` stores the guest and returns to the reservation page.
- `create-disabled` keeps Crear reserva unavailable until the name and room type are set.

## How to get to it (user POV)

- On Reservas, choose `Nueva reserva`.
- On Calendario, choose `Nueva reserva`.
- On Calendario, choose an empty night. Its button name is `Nueva reserva para habitación <number> el <d MMM yyyy>`.

## Driving it with verify-pms

Preconditions:

- Doctor prints `"ok": true` for `http://127.0.0.1:5179` and persist directory `.cursor/skills/verify-pms/.run/d1`.
- No guest is named `Verificación Portal`.

- **Open from the list.** Go to `http://127.0.0.1:5179/reservations`. Choose the button named `Nueva reserva`. A dialog titled `Nueva reserva` is visible. The button named `Crear reserva` is disabled.
- **Enter the guest.** Fill the textbox named `Nombre completo` with `Verificación Portal`. The room type is still empty, so `Crear reserva` stays disabled.
- **Choose a room type.** Open the combobox named `Tipo` inside the heading `Habitación 1` and choose the option `Estándar`. `Crear reserva` becomes enabled. Leave `Hab.` as `Sin asignar`. `Tipo` is a button, not a native `<select>`. Click it or press ArrowDown, then choose the option. A select-element API does not see it.
- **Save.** Choose `Crear reserva`. The URL becomes `/reservations/<id>` and the page shows `Verificación Portal`.
- **Confirm persistence.** Request `GET http://127.0.0.1:8799/reservations?q=Verificaci%C3%B3n%20Portal`. The JSON array contains one reservation whose guest name is `Verificación Portal`.
- **Proof.** Save the ARIA snapshot, a screenshot, and that JSON under `.cursor/skills/verify-pms/artifacts/create-reservation/`. `proof.json` records feature id `create-reservation` and entry point `Nueva reserva` on Reservas.

The calendar entry points are separate. Drive `create-from-calendar` on a later run; do not mark them done because the list path passed.

## Gotchas

- `Crear reserva` stays disabled until both `Nombre completo` and `Tipo` are set. An empty type is the usual miss.
- Check-in from the list button defaults to today's UTC date (`YYYY-MM-DD` from `toISOString`), which can differ from the calendar's local "today" late in the evening in the Americas.
- Saving navigates to the reservation page. A dialog that remains open means the save did not finish.
- Searching the list is required in addition to the reservation page. The page can render a draft that was not stored.
- The disposable database is deleted on cleanup. Keep the artifacts; they are the proof that the row existed.
- `Tipo` and `Hab.` are button comboboxes. `Check-in` and `Check-out` are buttons. Do not look for textboxes with those names.
- After `Crear reserva`, the button reads `Guardando…` and the fields disable. Wait until the URL is `/reservations/<id>` before snapshotting.
- If the browser screenshot tool writes outside the repo, copy the PNG into `.cursor/skills/verify-pms/artifacts/create-reservation/` before cleanup.
