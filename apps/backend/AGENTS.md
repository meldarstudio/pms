# Backend agent instructions

Paths below are relative to `apps/backend` unless stated otherwise.

## Routes and authentication

- `src/index.ts` mounts Hono routes. Use `Env` from `src/env.ts`; D1 is bound as `DB`. Request schemas come from `@pms/shared`.
- Use `validate` and `HttpError` from `src/http.ts`. Error JSON is `{ error: string }`; field-specific errors use the CORS-exposed `X-Error-Field` header. `rethrowConflict` maps database conflicts to public errors.
- Keep new routes behind `src/session.ts` and use the real login route in tests, without a bypass.
- `pnpm check` regenerates Worker types into git-ignored `.cloudflare/types`; refresh them alone with `pnpm --filter @pms/backend cf-typegen`.
- `cf d1` commands reach production unless given `--local`, and `cf --local` defaults to a directory the dev server never reads. Run D1 commands through `scripts/d1.mjs`, which targets the `.wrangler/state` that `cf dev` uses. Production backups use `wrangler d1 export` because `cf` has no D1 export.

## Reservation workflow

- Creates and edits are workflow commands, not field patches. `POST /reservations` uses `workflowCreateSchema`; `POST /reservations/:id/commands` writes; `POST /reservations/:id/preview` evaluates the same actions without writing.
- When changing commands, schemas, or previews, check the portal types and callers.

## Domain guardrails

- Use the [shared glossary](../../GLOSSARY.md) for statuses, billing, and room-inventory semantics.
- Saving and check-in allow unassigned reserved rooms; these still consume room-type inventory.
- Retained nights keep saved prices. Added nights use current rates; changing room type reprices that reserved room. Initial pricing uses a flat nightly rate when supplied, otherwise the date's override, otherwise the base rate.
- Guests use `fullName`. Dated closures block rooms and reduce room-type availability. A room's housekeeping status is set only by staff; it never blocks check-in, availability, or assignment, and reservation workflows must not change it.
- Drizzle does not generate the business-rule triggers (originally `drizzle/0001_overlap_triggers.sql`). New migrations must preserve or deliberately replace their capacity, overlap, assignment, closure, and staying-guest guards. Keep `rethrowConflict` and portal error translations aligned with trigger abort messages.

## Test environment

Colocated `.test.ts` and `.test.mjs` suites use `vite-plus/test` and registered
migrations against in-memory `node:sqlite`; no running Worker is needed.
Like D1, the test database rejects statements with more than 100 bound parameters.
Migration CLI tests also need Python 3's standard-library PTY for simulated
`cf` and Wrangler commands and a private home directory.
