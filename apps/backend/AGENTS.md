# Backend agent instructions

Paths below are relative to `apps/backend` unless stated otherwise.
Before backend tests or compiler changes, read the [README setup and validation guidance](README.md).
Before schema, migration, trigger, or seed changes, read [the database guide](../../docs/agents/database.md).

## Routes and authentication

- `src/index.ts` mounts Hono routes. Use `Env` from `src/env.ts`; D1 is bound as `DB`. Request schemas come from `@pms/shared`.
- Use `validate` and `HttpError` from `src/http.ts`. Error JSON is `{ error: string }`; field-specific errors use the CORS-exposed `X-Error-Field` header. `rethrowConflict` maps database conflicts to public errors.
- Before changing authentication, adding routes, or writing authenticated tests, read [staff login](README.md#staff-login). Keep new routes behind `src/session.ts` and use the real login route in tests, without a bypass. For local credentials, read [root setup](../../README.md#signing-in).
- Refresh generated Worker types with `pnpm --filter @pms/backend cf-typegen`; keep `worker-configuration.d.ts` generated.

## Reservation workflow

- Creates and edits are workflow commands, not field patches. `POST /reservations` uses `workflowCreateSchema`; `POST /reservations/:id/commands` writes; `POST /reservations/:id/preview` evaluates the same actions without writing.
- Preview returns `{ billing, validation: { issues } }`. Priceable drafts return 200 even when operational issues block saving. Issues refer to fields and indices in the proposed rooms, excluding removed rooms. Invalid pricing inputs still return an HTTP error.
- Before changing workflow reads, batches, guest updates, retries, or request receipts, read [concurrent saves](README.md#concurrent-reservation-saves), including the revision guards and temporary inventory release needed for atomic room swaps.
- Before changing preview/preflight checks, occupancy validation, restoration, date edits, or final status writes, read [save-time validation](README.md#room-validation-at-save-time), including when unchanged rooms are exempt from current-rule validation.

## Domain guardrails

- Before changing stay dates, check-in/checkout, cancellation, or room removal, read [reservation dates](README.md#reservation-dates). Use the [shared glossary](../../GLOSSARY.md) for statuses, billing, and room-inventory semantics.
- Saving and check-in allow unassigned reserved rooms; these still consume room-type inventory.
- Retained nights keep saved prices. Added nights use current rates; changing room type reprices that reserved room. Initial pricing uses a flat nightly rate when supplied, otherwise the date's override, otherwise the base rate.
- Guests use `fullName`. Rooms have no operational status; dated closures block rooms and reduce room-type availability.

## Property setup

Before changing `/setup` or room renumbering, read [property setup](README.md#property-setup), including atomic number swaps, ownership guards, omitted rooms, field errors, and last-write-wins behavior.
