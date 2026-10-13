---
name: verify-pms
description: Drive the PMS reception portal (Vite React) and its local Hono API the way a receptionist does. Use when proving calendar, reservation, inventory, or room-closure behavior in the browser against an isolated local database.
---

# Verify PMS

The primary surface is the reception portal. The Hono API on the isolated port is the side-effect check. Do not drive `pnpm dev` (portal `5173`, API `8788`): that instance uses the developer's default local D1 database. Two verification instances cannot share ports `5179` and `8799`; launch refuses when those ports are taken.

Sample data is pinned to UTC `2026-10-13`. Room types are Estándar, Superior, and Suite familiar. Rooms are `101`–`130`, `201`–`220`, and `301`–`310`. Seeded guests include Valeria Rojas and the unassigned stays Alejandro Demo, Sofía Demo, and Javier Demo.

## Launch

From the repository root:

```sh
node .cursor/skills/verify-pms/verify-pms.mjs launch
```

Launch creates `.cursor/skills/verify-pms/.run/d1`, runs `pnpm db:reset:local --date=2026-10-13 --persist-to=<that directory>`, then starts Wrangler and Vite. Ready means all of the following, not merely an open port:

- `GET http://127.0.0.1:8799/` returns `{"name":"pms"}`.
- `GET http://127.0.0.1:8799/room-types` returns Estándar, Superior, and Suite familiar.
- `GET http://127.0.0.1:8799/rooms` returns 60 rooms.
- `GET http://127.0.0.1:5179/` is HTML titled `Gestión hotelera` with `id="root"`.
- The served `src/lib/api.ts` contains `http://127.0.0.1:8799`.

The command prints one JSON object with `portalUrl`, `apiUrl`, `persistTo`, `anchor`, `apiPid`, and `portalPid`. Logs are `.cursor/skills/verify-pms/.run/api.log` and `portal.log`.

## Doctor

```sh
node .cursor/skills/verify-pms/verify-pms.mjs doctor
```

Run this first whenever a page is blank, a save fails, or a port looks wrong. Exit code `0` and `"ok": true` mean both recorded PIDs are alive, the API identity and seed counts match, and the portal bundle points at `http://127.0.0.1:8799`. Anything else is not worth driving. Doctor does not restart servers and does not touch the database.

## Drive

Use the Cursor browser against `portalUrl` from doctor. Prefer ARIA roles and accessible names. The app language is Spanish.

- Tabs: `Reservas`, `Calendario`, `Inventario y tarifas`.
- Direct URLs: `/reservations`, `/calendar?from=2026-10-13&span=7`, `/inventory?from=2026-10-13&span=14`, `/reservations/<id>`.
- Read `.cursor/skills/verify-pms/features/README.md` before a journey, then follow that feature file. A proof that uses one entry point does not cover the others listed there.

Confirm a mutation with both the screen and `GET http://127.0.0.1:8799/reservations?q=<guest name>`.

## Evidence

Write proof under `.cursor/skills/verify-pms/artifacts/<feature-id>/`. Capture the action and the resulting state. For UI proof save an ARIA snapshot and a screenshot that shows the portal title or the `PMS` header. If the browser tool stores the screenshot outside the repo, copy it into that artifacts directory before cleanup. For a mutation, also save the API JSON response. Record the feature id and the entry point in a `proof.json` next to those files. Do not treat a toast or a disabled button as proof by itself.

## Cleanup

```sh
node .cursor/skills/verify-pms/verify-pms.mjs cleanup
```

Cleanup sends `SIGTERM`, then `SIGKILL`, to the process groups recorded in `.cursor/skills/verify-pms/.run/state.json`, and deletes `.run` (PIDs, logs, and the disposable D1 directory). It does not delete `.cursor/skills/verify-pms/artifacts/`. After cleanup, confirm the proof files are still there. Never kill Wrangler or Vite by process name.

## Helpers

`node .cursor/skills/verify-pms/verify-pms.mjs launch | doctor | cleanup`

The script is the only process helper. Browser steps stay in the feature files because they use the page's accessible names.
