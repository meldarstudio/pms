# Backend agent instructions

Paths below are relative to `apps/backend` unless stated otherwise.

## Routes and authentication

- `src/index.ts` mounts Hono routes. Use `Env` from `src/env.ts`; D1 is bound as `DB`. Request schemas come from `@pms/shared`.
- Use `validate` and `HttpError` from `src/http.ts`. Error JSON is `{ error: string }`; field-specific errors use the CORS-exposed `X-Error-Field` header. `rethrowConflict` maps database conflicts to public errors.
- Keep staff routes behind `src/session.ts` and use the real login route in tests, without a bypass.
- Guest routes live only under `/public` (`src/routes/public.ts`): no session, non-credentialed CORS for `PUBLIC_ALLOWED_ORIGINS`, guest-safe projections only, and per-IP limits keyed by `cf-connecting-ip` (`src/rate-limit.ts`). Offer only room types listed in `PUBLISHED_ROOM_TYPE_IDS`. Public checkout routes (`src/public-checkouts.ts`) authorize only with the checkout's `Authorization: Bearer` token, stored as a SHA-256 hash; quote, reservation, and contact identifiers never grant access.
- `POST /public/checkout/quotes` refreshes the stored selection. When the latest acceptance's quote has the same room, stay, occupancy, nightly prices and terms, it records that contact and language against the new quote; any material difference, including a lower price, leaves the new quote unaccepted. An open payment attempt blocks the refresh. Carrying an acceptance forward counts toward the 20-acceptance cap and is refused before the new quote is stored.
- `POST /public/checkout/payments` (`src/public-payments.ts`) returns an open attempt of the checkout instead of charging again; a new charge needs owner-enabled public payment admission (`src/operation-controls.ts`, off by default), the checkout's latest unexpired accepted quote, the `PAYMENT_IP_LIMITER` and per-checkout `PAYMENT_CHECKOUT_LIMITER`, and server-side Turnstile (`src/turnstile.ts`), in that order, before `startPaymentAttempt`. An expired quote is refused there and is not replaced by that route. Status reads (`GET /public/checkout/payment`) reconcile but never charge or consume limits. `POST /public/checkout/payment/authentication` continues that checkout's current `review` attempt only when the body names its id, with the stored amount, source and device fingerprint, including after that quote expires and while new payments are paused. It does not take a source id, Turnstile token or payment allowance. A repeat, a different attempt id, or a continuation once the attempt is no longer `review`, returns the current guest payment and does not charge. Guest payment reads include that attempt id. `POST /public/checkout/payment/authentication/failure` records the bank refusing that named `review` attempt as `failed` with the fixed code `authentication_failed`, stores no browser text, and otherwise changes nothing and returns the current guest payment. The scheduled run fails `review` attempts left unfinished for 24 hours as `authentication_expired`, a bounded batch per run. Either failure is a conditional update from `review`, so it cannot race a continuation into a charge. Every attempt comes from a checkout and reads its contact (name, email, phone, notes) from its acceptance (`acceptance_id`); `payment_attempts.email` stays as the email sent to Culqi, which recovery matches.
- `GET /public/reservation` (`src/reservation-access.ts`) reads one saved public reservation with its access bearer. It includes each room type's current name and the saved agreement for every status; the live free-cancellation promise is included only while the stay holds inventory. The token is stored in plaintext, unhashed, because `GET /reservations/:id/access` returns the same link to a signed-in staff or owner account; that response is `Cache-Control: private, no-store` and does not create a link. `GET /public/checkout/access` returns the established token for that checkout and does not create or rotate it. Desk and legacy reservations have no access row.
- Confirmation emails (`src/confirmation-emails.ts`) are one outbox table, `confirmation_emails`. `saveQuote` queues the automatic row in the batch that saves a Confirmed public reservation. The scheduled handler sends due `pending` rows with `Idempotency-Key` set to the row id and renders content when first sent (`src/confirmation-email.ts`), keeping that request in `pending_request` so every retry posts the same payload under the same key until the row settles: a transient Resend error retries with backoff up to `MAX_SEND_ATTEMPTS`, then `failed`; a refused message fails at once; an automatic row whose reservation is no longer Confirmed fails as `not_confirmed`. Expired access produces staff-assistance copy, never a renewed link. Delivery reports are not collected; bounces are in the Resend dashboard.
- `GET /reservations/:id/confirmation` returns the reservation's confirmation emails newest first. `POST /reservations/:id/confirmation/resends` queues a `resend` row (a dated summary) for an explicit recipient on a reservation with an access link; the row id is the request id, and a replay returns the same row. Both responses are private/no-store and omit message bodies and tokens.
- Owner `GET|PUT /controls/public-payments` (`src/operation-controls.ts`) is the portal's **Pagos en línea** switch; its `updatedAt` is the last payment admission change. Confirmation sending has no admission switch: the scheduler sends due rows whenever `RESEND_API_KEY` is set, whatever public payment admission is, and only the scheduler sends. `operation_controls.email_submission_admitted` is a retired column that nothing reads or writes. Scheduled payment reconciliation precedes authentication expiry and sending, so a reservation it saves is confirmed in the same tick; each scheduled step still runs when an earlier one fails, and its failure is logged by step name. `RESEND_API_URL` is honored only for a loopback address. Tracking-off and enforced TLS are account settings owned by #228, not configured here.
- The scheduled run's last step, `purgeAbandonedCheckouts` (`src/abandoned-checkouts.ts`), deletes up to a bounded number of abandoned public checkouts per tick, each in one batch with its failed attempts, acceptances and quotes, and the same for quotes from before public checkouts (`checkout_id IS NULL`) that expired over 30 days ago. Every delete re-checks the abandonment rule, so activity between choosing and deleting keeps the checkout. `public_checkouts.reserved_once`, set by a trigger on `reservations` and never cleared, only keeps reserved checkouts out of the age index the search walks; the rule itself still checks reservations.
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
`createTestDb` signs in through the real login route once per role and clock instant
in a file, then copies that session row into later databases, so suites under one
fake time hash a password once. Use `login` from `src/test-support/auth.ts` when the
sign-in itself is under test.

## Complaint book

The Libro de Reclamaciones is committed in two files that `src/complaint-config.ts` merges
and validates when it loads: the guest-facing provider, notices and `policyVersion` in
`packages/shared/src/complaint-book.json`, which the website also prerenders, and the
internal `src/complaint-book-operations.json` (book `LR` from sheet 1, retention, monitoring,
backup and sender), which must stay out of the website. It is served in every environment;
local dev and tests file into that book against their own database. Changing
`policyVersion` or the disclosures in that file is a reviewed release change: each sheet
stores the disclosures it was filed under. Receipt emails (`src/complaint-emails.ts`) are
an outbox, `complaint_emails`: filing queues one `automatic` row in the batch that saves the
sheet, and the scheduled run hands due `pending` rows to Resend through the same client as
confirmation emails, with `Idempotency-Key` set to the row id and the message kept in
`pending_request`, so every retry posts the same payload under the same key. Transient errors
retry with backoff up to `MAX_RECEIPT_HANDOFF_ATTEMPTS` and never past
`RETRY_WINDOW_WITHIN_RESEND_DEDUPLICATION_MS` from the first attempt; a refused message fails
at once. `failed` is the portal's **Requiere atención**; nothing restarts it.
`POST /complaints/:id/email-copies` queues a `copy` row, whose id is the request id, only
while the latest row is `failed`, and a partial unique index allows one `pending` row per
sheet. Rows stay `pending` while `RESEND_API_KEY` is unset. `delivery_uncertain` and
`retry_request_id` are retired columns that nothing reads or writes. Owner notes
(`complaint_notes`) are immutable dated text; they never count as a response or change the
due date. `correctsId` on older responses stays readable, but new responses cannot set it.
Owner response attachments live in the private R2 bucket `pms-complaint-files`,
bound as `COMPLAINT_ATTACHMENTS` and simulated locally. It has no lock rule yet;
retention/disposal is #294. Response due dates count 15 weekdays after the property-time
filing date; holidays count as business days, so the shown deadline is never later than
the legal one.
