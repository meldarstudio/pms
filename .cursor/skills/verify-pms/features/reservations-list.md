# Reservations list

The reservations list lets reception scan arrivals, search by guest or code, filter by status, and open one reservation.

## Sub-features

- `list-seed` shows seeded stays for the default arrival day.
- `list-search` narrows the list by guest name.
- `list-status` filters by reservation status.
- `list-open` opens the reservation page for a row.

## How to get to it (user POV)

- Choose the `Reservas` tab.
- Open `http://127.0.0.1:5179/reservations`.

## Driving it with verify-pms

Preconditions:

- Doctor prints `"ok": true`.
- The sample anchor is `2026-10-13`, so Valeria Rojas exists. The list defaults to that UTC day when `checkIn` is missing. If the anchor is another day, set `checkIn` in the URL or use `Hoy` only when that day is UTC today.

- **Open the list.** Go to `http://127.0.0.1:5179/reservations?checkIn=2026-10-13`. The heading `Reservas y estancias` is visible. The arrival field `Llegada` shows 13 oct 2026. At least one row named `Abrir reserva de Valeria Rojas` is shown. There is no `Reservas visibles` card.
- **Search.** Fill the textbox named `Huésped o código` with `Valeria Rojas`. The list shows `Valeria Rojas` and does not show `Alejandro Demo`.
- **Filter.** Set the combobox named `Estado` to `Confirmada`. Valeria Rojas remains only if that seeded stay is confirmed; otherwise the empty title `No se encontraron reservas` is the result. Record which one the seed produced.
- **Open.** Choose the row named `Abrir reserva de Valeria Rojas`. The URL is `/reservations/<id>` and the heading starts with `Reserva`.
- **Proof.** Save the search snapshot and a screenshot under `.cursor/skills/verify-pms/artifacts/reservations-list/`.

## Gotchas

- The count line says `Buscando reservas…` while the first request is in flight. Wait until a row such as `Abrir reserva de Valeria Rojas` appears before treating the page as empty.
- Search is debounced through the URL query `q`. Wait until the address bar contains `q=Valeria` before asserting the filtered rows.
- Status values in the combobox are `Todos los estados`, `Confirmada`, `En estancia`, `Salida registrada`, `No se presentó`, and `Cancelada`.
- `Hoy` sets the UTC arrival day. `Todas las fechas` writes `checkIn=all` and lists every date. A missing `checkIn` means UTC today, so a shared link for a specific day must include that day.
- Page controls are `Anterior` and `Siguiente`. `Siguiente` stays disabled when the page has fewer than 50 rows. They are hidden when the first page is empty.
- Opening a row uses `Abrir reserva de <name>`.
