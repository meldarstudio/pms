# Backend agent instructions

Paths below are relative to `apps/backend` unless stated otherwise.

## Routes and authentication

- `src/index.ts` mounts Hono routes. Use `Env` from `src/env.ts`; D1 is bound as `DB`. Request schemas come from `@pms/shared`.
- Use `validate` and `HttpError` from `src/http.ts`. Error JSON is `{ error: string }`; field-specific errors use the CORS-exposed `X-Error-Field` header. `rethrowConflict` maps database conflicts to public errors.
- Keep staff routes behind `src/session.ts` and use the real login route in tests, without a bypass.
- `POST /callbacks/resend` (`src/confirmation-reports.ts`) is an exact signed-provider route registered before session middleware, not a `/public` route or prefix bypass. Authenticate raw bytes through `src/resend-reports.ts` before work access. `RESEND_WEBHOOK_SECRET` is separate from the API credential. Reporting and bounded known-ID recovery continue while email submission is paused; neither authorizes another POST.
- Guest routes live only under `/public` (`src/routes/public.ts`): no session, non-credentialed CORS for `PUBLIC_ALLOWED_ORIGINS`, guest-safe projections only, and per-IP limits keyed by `cf-connecting-ip` (`src/rate-limit.ts`). Offer only room types listed in `PUBLISHED_ROOM_TYPE_IDS`. Public checkout routes (`src/public-checkouts.ts`) authorize only with the checkout's `Authorization: Bearer` token, stored as a SHA-256 hash; quote, reservation, and contact identifiers never grant access.
- `POST /public/checkout/quotes` refreshes the stored selection. When the latest acceptance's quote has the same room, stay, occupancy, nightly prices and terms, it records that contact and language against the new quote; any material difference, including a lower price, leaves the new quote unaccepted. An open payment attempt blocks the refresh. Carrying an acceptance forward counts toward the 20-acceptance cap and is refused before the new quote is stored.
- `POST /public/checkout/payments` (`src/public-payments.ts`) returns an open attempt of the checkout instead of charging again; a new charge needs owner-enabled public payment admission (`src/operation-controls.ts`, off by default), the checkout's latest unexpired accepted quote, the `PAYMENT_IP_LIMITER` and per-checkout `PAYMENT_CHECKOUT_LIMITER`, and server-side Turnstile (`src/turnstile.ts`), in that order, before `startPaymentAttempt`. An expired quote is refused there and is not replaced by that route. Status reads (`GET /public/checkout/payment`) reconcile but never charge or consume limits. `POST /public/checkout/payment/authentication` continues that checkout's current `review` attempt only when the body names its id, with the stored amount, source and device fingerprint, including after that quote expires and while new payments are paused. It does not take a source id, Turnstile token or payment allowance. A repeat, a different attempt id, or a continuation once the attempt is no longer `review`, returns the current guest payment and does not charge. Guest payment reads include that attempt id. Staff authentication still expires with the quote.
- `GET /public/reservation` (`src/reservation-access.ts`) reads one saved public reservation with its access bearer. It includes each room type's current name and the saved agreement for every status; the live free-cancellation promise is included only while the stay holds inventory. The token is stored as a SHA-256 hash and in plaintext so `GET /reservations/:id/access` can return the same link to a signed-in staff or owner account; that response is `Cache-Control: private, no-store` and does not create a link. `GET /public/checkout/access` returns the established token for that checkout and does not create or rotate it. Desk and legacy reservations have no access row.
- `GET /reservations/:id/confirmation` (`src/confirmation-intents.ts`) preserves the original intent/submission projection and adds original/later work history, safe provider context, attempts, and delivery facts for staff/owner sessions. `POST /reservations/:id/confirmation/resends` (`src/confirmation-resends.ts`) requires an explicit recipient and duplicate-risk acknowledgement; receipt replay returns the same account-attributed work. It requires an existing intent/access row and changes neither contact nor original work. Both responses are private/no-store and omit request bodies, links, tokens and credential fingerprints.
- Deliberate resend content snapshots current status/agreement/bill on its first admitted scheduled tick. It is a dated summary, not a fresh confirmation. Any subsequent reservation revision or included-link expiry stops submission without rewriting its immutable request; another message requires another explicit command. Expired access produces staff-assistance copy, never a renewed link. Pre-upgrade attempts have no fabricated attempt history.
- Owner `GET|PUT /controls/email-submission` (`src/operation-controls.ts`) admits confirmation submission, including deliberate work, off by default and separate from public payment admission. Commands can queue while paused; only the scheduler sends. Scheduled payment reconciliation and confirmation-intent repair precede sending; budgeted provider lookups follow sending. `RESEND_API_URL` is honored only for a loopback address. Tracking-off and enforced TLS are account settings owned by #228, not configured here.
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
