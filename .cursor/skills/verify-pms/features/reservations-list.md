# Reservations list

The reservations list lets reception scan arrivals for a check-in day, search by guest or code, filter by status, and open one reservation.

## Sub-features

- `list-seed` shows seeded stays for the chosen arrival day.
- `list-search` narrows the list by guest name or code.
- `list-status` filters by reservation status.
- `list-open` opens the reservation page for a row.

## How to get to it (user POV)

- Choose the `Reservas` tab.
- Open `http://127.0.0.1:5179/reservations`.

## Driving it with verify-pms

Preconditions:

- Doctor prints `"ok": true`.
- The sample anchor is `2026-10-13`. Seeded arrivals that day include Alejandro Demo, Sofía is not on that morning list in the current seed, Javier Demo, and other desk stays. Valeria Rojas checks in on `2026-10-05` (checked out), so open her with `checkIn=2026-10-05`.

- **Open the list.** Go to `http://127.0.0.1:5179/reservations?checkIn=2026-10-13`. The heading `Reservas` is visible. The arrival field `Check-in` shows 13 Oct 2026. At least one row named `Abrir reserva de Alejandro Demo` is shown. There is no `Reservas visibles` card.
- **Search on that day.** Fill the textbox named `Huésped o código` with `Alejandro`. Wait until the address bar contains `q=Alejandro`. The list shows `Alejandro Demo` and does not show `Javier Demo`.
- **Open another arrival day.** Go to `http://127.0.0.1:5179/reservations?checkIn=2026-10-05`. The arrival field shows 5 Oct 2026 and the list shows `Valeria Rojas`.
- **Filter.** With `checkIn=2026-10-13` and empty search, set the combobox named `Estado` to `Confirmada`. Arrivals that day that are confirmed remain.
- **Open.** Choose the row named `Abrir reserva de Alejandro Demo`. The URL is `/reservations/<id>` and the heading starts with `Reserva`.
- **Proof.** Save the search snapshot and a screenshot under `.cursor/skills/verify-pms/artifacts/reservations-list/`.

## Gotchas

- The count line says `Buscando reservas…` while the first request is in flight. Wait until a named row appears before treating the page as empty.
- Search updates through the URL query `q`. Wait until the address bar contains the expected `q` before asserting the filtered rows.
- Status values in the combobox are `Todos los estados`, `Confirmada`, `Check-in`, `Check-out`, `No se presentó`, and `Cancelada`.
- A missing, empty, invalid, or `all` `checkIn` becomes UTC today, so a shared link for a specific day must include that day. The list always shows one arrival day. There is no Hoy button on this page.
- Page controls are `Anterior` and `Siguiente`. `Siguiente` stays disabled when the page has fewer than 50 rows. They are hidden when the first page is empty.
- Opening a row uses `Abrir reserva de <name>`.
