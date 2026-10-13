# Reservations list

The reservations list lets reception scan stays, search by guest or code, filter by status, and open one reservation.

## Sub-features

- `list-seed` shows seeded stays on the first page.
- `list-search` narrows the list by guest name.
- `list-status` filters by reservation status.
- `list-open` opens the reservation page for a row.

## How to get to it (user POV)

- Choose the `Reservas` tab.
- Open `http://127.0.0.1:5179/reservations`.

## Driving it with verify-pms

Preconditions:

- Doctor prints `"ok": true`.
- The sample anchor is `2026-10-13`, so Valeria Rojas exists.

- **Open the list.** Go to `http://127.0.0.1:5179/reservations`. The heading `Reservas y estancias` is visible and at least one guest button is shown. The card `Reservas visibles` shows a count.
- **Search.** Fill the textbox named `Buscar por huésped o código` with `Valeria Rojas`. The list shows a button named `Valeria Rojas` and does not show `Alejandro Demo`.
- **Filter.** Set the combobox named `Estado de habitación` to `Confirmadas`. Valeria Rojas remains only if that seeded stay is confirmed; otherwise the empty title `No se encontraron reservas` is the result. Record which one the seed produced.
- **Open.** Choose the button named `Abrir reserva de Valeria Rojas`. The URL is `/reservations/<id>` and the heading starts with `Reserva`.
- **Proof.** Save the search snapshot and a screenshot under `.cursor/skills/verify-pms/artifacts/reservations-list/`.

## Gotchas

- The count cards render `0` while the list request is still in flight. Wait until a guest button such as `Valeria Rojas` appears before treating the page as empty.
- Search is debounced through the URL query `q`. Wait until the address bar contains `q=Valeria` before asserting the filtered rows.
- Status values in the combobox are `Todos los estados`, `Confirmadas`, `En estancia`, `Salida registrada`, `No se presentó`, and `Canceladas`.
- Page controls are `Anterior` and `Siguiente`. `Siguiente` stays disabled when the page has fewer than 50 rows.
- Opening a row uses either the guest-name button or `Abrir reserva de <name>`. Both must land on the same reservation id.
