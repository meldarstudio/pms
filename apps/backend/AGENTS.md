# Backend agent instructions

Paths below are relative to `apps/backend` unless stated otherwise.
Before backend tests or compiler changes, read the root [setup and validation guidance](../../README.md#testing) and [backend test environment](README.md#implementation-and-tests).
Before schema, migration, trigger, or seed changes, read [the database guide](../../docs/agents/database.md).

## Routes and authentication

- `src/index.ts` mounts Hono routes. Use `Env` from `src/env.ts`; D1 is bound as `DB`. Request schemas come from `@pms/shared`.
- Use `validate` and `HttpError` from `src/http.ts`. Error JSON is `{ error: string }`; field-specific errors use the CORS-exposed `X-Error-Field` header. `rethrowConflict` maps database conflicts to public errors.
- Before changing authentication, adding routes, or writing authenticated tests, read [authentication](../../docs/authentication.md). Keep new routes behind `src/session.ts` and use the real login route in tests, without a bypass. For local credentials, read [root setup](../../README.md#signing-in).
- Refresh generated Worker types with `pnpm --filter @pms/backend cf-typegen`; keep `worker-configuration.d.ts` generated.

## Reservation workflow

- Creates and edits are workflow commands, not field patches. `POST /reservations` uses `workflowCreateSchema`; `POST /reservations/:id/commands` writes; `POST /reservations/:id/preview` evaluates the same actions without writing.
- Before changing commands, schemas, or previews, read [commands and previews](../../docs/reservations.md#commands-and-previews), and check the portal types and callers.
- Before changing workflow reads, batches, guest updates, retries, or request receipts, read [concurrent saves](../../docs/reservations.md#concurrent-reservation-saves), including the revision guards and temporary inventory release needed for atomic room swaps.
- Before changing preview/preflight checks, occupancy validation, restoration, date edits, or final status writes, read [save-time validation](../../docs/reservations.md#room-validation-at-save-time), including when unchanged rooms are exempt from current-rule validation.

## Domain guardrails

- Before changing stay dates, check-in/checkout, cancellation, or room removal, read [reservation dates](../../docs/reservations.md#stay-dates-and-lifecycle) and [the property calendar](../../docs/property-calendar.md). Use the [shared glossary](../../GLOSSARY.md) for statuses, billing, and room-inventory semantics.
- Saving and check-in allow unassigned reserved rooms; these still consume room-type inventory.
- Retained nights keep saved prices. Added nights use current rates; changing room type reprices that reserved room. Initial pricing uses a flat nightly rate when supplied, otherwise the date's override, otherwise the base rate.
- Guests use `fullName`. Dated closures block rooms and reduce room-type availability. A room's [housekeeping status](../../docs/housekeeping.md) is set only by staff; it never blocks check-in, availability, or assignment, and reservation workflows must not change it.

## Property setup

Before changing `/setup` or room renumbering, read [property setup](../../docs/property-setup.md), including atomic number swaps, ownership guards, omitted rooms, field errors, and last-write-wins behavior.
