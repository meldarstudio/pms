# PMS verification map

This directory is the maintained source for verifying receptionist-facing behavior. Read this index, then use the matching feature file.

## Baseline preconditions

- Launch with `node .cursor/skills/verify-pms/verify-pms.mjs launch`.
- The portal is `http://127.0.0.1:5179` and the API is `http://127.0.0.1:8799`, backed by `.cursor/skills/verify-pms/.run/d1`.
- Sample dates are anchored at UTC `2026-10-13`.
- `node .cursor/skills/verify-pms/verify-pms.mjs doctor` must print `"ok": true` before driving.
- Never drive `pnpm dev` or any server this launch did not start.

## Driving conventions

- Start every recipe from the baseline unless its preconditions say otherwise.
- Prefer ARIA roles and accessible names.
- Keep quoted Spanish labels unchanged.
- Browser actions go to `portalUrl` from doctor. API checks go to `apiUrl`.
- Cleanup removes the instance and the disposable database. It keeps files under `.cursor/skills/verify-pms/artifacts/`.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- UI proof is an ARIA snapshot plus a screenshot that shows the `PMS` header or the page title `Gestión hotelera`.
- Mutation proof includes `GET /reservations?q=` (or the matching read of the changed resource) saved next to the snapshot.
- Record the feature id and entry point in `proof.json`.
- An unreachable entry point is a failure. Say which command failed and which precondition was missing. Do not mark it verified through a different path.

## Feature entry contract

Each feature file has an H1, one paragraph, then four H2 sections: `Sub-features`, `How to get to it (user POV)`, `Driving it with verify-pms`, and `Gotchas`.

## Features

- [Create a reservation](./create-reservation.md) opens the new-reservation dialog from the list or the calendar and saves a named stay.
- [Reservations list](./reservations-list.md) searches seeded guests, filters by status, and opens a stay.
- [Calendar](./calendar.md) moves the visible week and opens an existing stay or an empty night.
- [Inventory and rates](./inventory.md) shows room-type availability and opens a night's rate.
- [Room closure](./room-closure.md) blocks a room for a date range from the calendar.
