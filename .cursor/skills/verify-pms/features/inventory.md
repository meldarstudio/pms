# Inventory and rates

Inventory and rates shows, for each room type and night, the price and how many rooms are free. Choosing a night opens that type's rate editor.

## Sub-features

- `inventory-grid` renders the three room types for the anchored range.
- `inventory-move` shifts the visible range.
- `inventory-rate` opens the rate dialog for one type and night.

## How to get to it (user POV)

- Choose the `Inventario y tarifas` tab.
- Open `http://127.0.0.1:5179/inventory?from=2026-10-13&span=14`.

## Driving it with verify-pms

Preconditions:

- Doctor prints `"ok": true`.
- The anchor is `2026-10-13`.

- **Open inventory.** Go to `http://127.0.0.1:5179/inventory?from=2026-10-13&span=14`. Buttons for `Estándar`, `Superior`, and `Suite familiar` are visible. An Estándar night at the anchor includes `S/ 180` in its accessible name.
- **Move the range.** Choose `Día siguiente`. The URL `from` becomes `2026-10-14`.
- **Open a rate.** Choose the button whose name starts with `Estándar, 13 oct 2026`. A dialog titled `Estándar` is visible with a `Guardar` button. Close the dialog without saving.
- **Proof.** Save a snapshot and screenshot that include an Estándar price under `.cursor/skills/verify-pms/artifacts/inventory/`.

## Gotchas

- The night button name is `<type>, <d MMM yyyy>, <price>, <free> libres`. Match the type and date; the free count changes when stays overlap that night.
- Rate overrides on offsets 4, 5, 11, and 12 from the anchor are `S/ 200` for Estándar (`18000` plus `2000` cents), not the base `S/ 180`.
- `Guardar` writes a rate. A proof that only opens the dialog must close it without choosing `Guardar`.
- Span defaults to 14 on this route and 7 on the calendar. Do not reuse a calendar URL and expect the inventory default.
