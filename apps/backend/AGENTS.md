# Backend agent instructions

Paths below are relative to `apps/backend` unless stated otherwise.

## Routes and authentication

- `src/index.ts` mounts Hono routes. Use `Env` from `src/env.ts`; D1 is bound as `DB`. Request schemas come from `@pms/shared`.
- Use `validate` and `HttpError` from `src/http.ts`. Error JSON is `{ error: string }`; field-specific errors use the CORS-exposed `X-Error-Field` header. `rethrowConflict` maps database conflicts to public errors.
- Keep staff routes behind `src/session.ts` and use the real login route in tests, without a bypass.
- Guest routes live only under `/public` (`src/routes/public.ts`): no session, non-credentialed CORS for `PUBLIC_ALLOWED_ORIGINS`, guest-safe projections only, and per-IP limits keyed by `cf-connecting-ip` (`src/rate-limit.ts`). Offer only room types listed in `PUBLISHED_ROOM_TYPE_IDS`. Public checkout routes (`src/public-checkouts.ts`) authorize only with the checkout's `Authorization: Bearer` token, stored as a SHA-256 hash; quote, reservation, and contact identifiers never grant access.
- `POST /public/checkout/quotes` refreshes the stored selection. When the latest acceptance's quote has the same room, stay, occupancy, nightly prices and terms, it records that contact and language against the new quote; any material difference, including a lower price, leaves the new quote unaccepted. An open payment attempt blocks the refresh. Carrying an acceptance forward counts toward the 20-acceptance cap and is refused before the new quote is stored.
- `POST /public/checkout/payments` (`src/public-payments.ts`) returns an open attempt of the checkout instead of charging again; a new charge needs owner-enabled public payment admission (`src/operation-controls.ts`, off by default), the checkout's latest unexpired accepted quote, the `PAYMENT_IP_LIMITER` and per-checkout `PAYMENT_CHECKOUT_LIMITER`, and server-side Turnstile (`src/turnstile.ts`), in that order, before `startPaymentAttempt`. An expired quote is refused there and is not replaced by that route. Status reads (`GET /public/checkout/payment`) reconcile but never charge or consume limits.
- `CULQI_API_URL` and `TURNSTILE_VERIFY_URL` only take effect for loopback addresses; the website's browser tests point them at local doubles.
- `pnpm check` regenerates Worker types into git-ignored `.cloudflare/types`; refresh them alone with `pnpm --filter @pms/backend cf-typegen`.
- `cf d1` commands reach production unless given `--local`, and `cf --local` defaults to a directory the dev server never reads. Run D1 commands through `scripts/d1.mjs`, which targets the `.wrangler/state` that `cf dev` uses.

## Reservation workflow

- Creates and edits are workflow commands, not field patches. `POST /reservations` uses `workflowCreateSchema`; `POST /reservations/:id/commands` writes; `POST /reservations/:id/preview` evaluates the same actions without writing.
- When changing commands, schemas, or previews, check the portal types and callers.

## Domain guardrails

- Use the [shared glossary](../../GLOSSARY.md) for statuses, billing, and room-inventory semantics.
- Saving and check-in allow unassigned reserved rooms; these still consume room-type inventory.
- Retained nights keep saved prices. Added nights use current rates; changing room type reprices that reserved room. Initial pricing uses the date's override, otherwise the base rate.
- Guests use `fullName`. Dated closures block rooms and reduce room-type availability. A room's housekeeping status is set only by staff; it never blocks check-in, availability, or assignment, and reservation workflows must not change it.
- Drizzle does not generate the business-rule triggers (originally `drizzle/0001_overlap_triggers.sql`). New migrations must preserve or deliberately replace their capacity, overlap, assignment, closure, and staying-guest guards. Keep `rethrowConflict` and portal error translations aligned with trigger abort messages.

## Test environment

Colocated `.test.ts` and `.test.mjs` suites use `vite-plus/test` and registered
migrations against in-memory `node:sqlite`; no running Worker is needed.
Like D1, the test database rejects statements with more than 100 bound parameters.
