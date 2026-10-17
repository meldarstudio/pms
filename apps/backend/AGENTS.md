# Backend agent instructions

Paths below are relative to `apps/backend` unless stated otherwise.
Read [README.md](README.md) before backend development or tests. Tests use real routes and in-memory SQLite with the migration journal, not a running Worker.
Before schema, migration, trigger, or seed changes, read [the database guide](../../docs/agents/database.md).

## Routes and authentication

- `src/index.ts` mounts Hono routes. Use `Env` from `src/env.ts`; D1 is bound as `DB`. Request schemas come from `@pms/shared`.
- Use `validate` and `HttpError` from `src/http.ts`. Error JSON is `{ error: string }`; field-specific errors use the CORS-exposed `X-Error-Field` header. `rethrowConflict` maps database conflicts to public errors.
- Every route except `GET /` and `POST /login` requires the Staff account session. Keep the guard in `src/session.ts`; tests sign in through `src/test-support/auth.ts`, without a bypass.
- There is one shared Staff account, with no roles or per-person attribution. See [staff login](README.md#staff-login) for secrets and session behavior, and [root setup](../../README.md#signing-in) for local `.dev.vars`.
- Refresh generated Worker types with `pnpm --filter @pms/backend cf-typegen`; keep `worker-configuration.d.ts` generated.

## Reservation workflow

- Creates and edits are workflow commands, not field patches. `POST /reservations` uses `workflowCreateSchema`; `POST /reservations/:id/commands` writes; `POST /reservations/:id/preview` evaluates the same actions without writing.
- Preview returns `{ billing, validation: { issues } }`. Priceable drafts return 200 even when operational issues block saving. Issues refer to fields and indices in the proposed rooms, excluding removed rooms. Invalid pricing inputs still return an HTTP error.
- `requestId` deduplicates retries; reuse with a different payload returns 409. Keep receipts, payments, contact changes, and reservation writes atomic.
- Preserve the temporary `cancelled` release inside the write transaction, followed by the final status. Room swaps otherwise trip overlap triggers.
- Preserve revision guards and bounded retries. Read [concurrent saves](README.md#concurrent-reservation-saves) before changing workflow reads, batches, guest updates, or retry behavior. Revisions stay internal to the database.
- Preview is advisory. Triggers remain authoritative at write time. Read [save-time validation](README.md#room-validation-at-save-time) before changing occupancy checks, restoration, date edits, or final status writes. Unchanged saved rooms must remain editable after an occupancy-limit reduction.

## Domain guardrails

- One reservation has shared `checkIn` and `checkOut` dates for every reserved room. Check-in and checkout change status only; early departure saves shorter dates together with `checked_out`.
- `confirmed`, `checked_in`, and `checked_out` hold inventory. Unassigned reserved rooms also consume room-type inventory and are allowed when saving or checking in.
- Cancellation releases inventory and drops room charges, retaining payments as credit for reference. Removing a reserved room releases only that room; cancel the reservation to release its last room.
- Retained nights keep saved prices. Added nights use current rates; changing room type reprices that reserved room. Initial pricing uses a flat nightly rate when supplied, otherwise the date's override, otherwise the base rate.
- Guests use `fullName`. Rooms have no operational status; dated closures block rooms and reduce room-type availability.

## Property setup

Before changing `/setup` or room renumbering, read [property setup](README.md#property-setup). Keep room-type edits and room changes atomic, including temporary number release for swaps and ownership guards. Omitted rooms remain unchanged. Setup uses last-write-wins, not reservation-style revision checks or retry receipts.
