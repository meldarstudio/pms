# Backend agent instructions

Paths below are relative to `apps/backend` unless stated otherwise.

## Routes and authentication

- `src/index.ts` mounts Hono routes. Use `Env` from `src/env.ts`; D1 is bound as `DB`. Request schemas come from `@pms/shared`.
- Use `validate` and `HttpError` from `src/http.ts`. Error JSON is `{ error: string }`; field-specific errors use the CORS-exposed `X-Error-Field` header. `rethrowConflict` maps database conflicts to public errors.
- Keep staff routes behind `src/session.ts` and use the real login route in tests, without a bypass.
- Guest routes live only under `/public` (`src/routes/public.ts`): no session, non-credentialed CORS for `PUBLIC_ALLOWED_ORIGINS`, guest-safe projections only, and per-IP limits keyed by `cf-connecting-ip` (`src/rate-limit.ts`). Offer only room types listed in `PUBLISHED_ROOM_TYPE_IDS`. Public checkout routes (`src/public-checkouts.ts`) authorize only with the checkout's `Authorization: Bearer` token, stored as a SHA-256 hash; quote, reservation, and contact identifiers never grant access.
- Public payment changes: new-attempt gates are in `src/routes/public.ts`; the insert in `src/payment-attempts.ts` rechecks admission, quote, and acceptance atomically. Bank authentication continues the existing attempt, even while new attempts are paused. Continuation, refusal, and expiry compete to claim the same `review` state. Status reads reconcile without charging.
- Reservation access: see [why staff re-share the same bearer link](../../docs/adr/0002-reusable-reservation-access-link.md) before changing token storage or lookup in `src/reservation-access.ts`.
- Confirmation emails (`src/confirmation-emails.ts`) and complaint receipts (`src/complaint-emails.ts`) are outbox tables sent only by the scheduled run through `src/email-outbox.ts`. Each send uses the row id as `Idempotency-Key` and replays the stored `pending_request`, so every retry posts the same payload under the same key.
- Keep scheduled steps independent on failure (`src/index.ts`). Reconcile payments before sending so a newly saved reservation's confirmation email can go out in the same run.
- `purgeAbandonedCheckouts` (`src/abandoned-checkouts.ts`) re-checks the abandonment rule on every delete and never deletes quotes with `checkout_id IS NULL`.
- Leave retired columns out of application logic: `operation_controls.email_submission_admitted`, `complaint_emails.delivery_uncertain`, `complaint_emails.retry_request_id`.
- Public checkouts and quotes store their ordered room requests in `rooms`.
- D1 applies each migration in one transaction and always enforces foreign keys. To rebuild a table other tables reference, set `PRAGMA defer_foreign_keys = ON`, copy the rows out, drop it, recreate it under its own name and reinsert them (`drizzle/0052_drop_one_room_columns.sql`); Drizzle's generated `__new_` rename fails.
- `CULQI_API_URL`, `TURNSTILE_VERIFY_URL` and `RESEND_API_URL` take effect only for loopback addresses; the website's browser tests point them at local doubles.
- Local dev sets Vite's `server.cors: false` in `vite.config.ts`, so credentialed CORS preflights reach the Worker and get its origin and credentials policy instead of Vite's.
- `pnpm check` regenerates Worker types into git-ignored `.cloudflare/types`; refresh them alone with `pnpm --filter @pms/backend cf-typegen`.
- `cf d1` commands reach production unless given `--local`. `scripts/d1.mjs` points local commands at the same `.cloudflare/state` as `cf dev`. Use `pnpm db:reset:local` to seed fresh local data.

## Reservation workflow

- Creates and edits are workflow commands, not field patches. `POST /reservations` uses `workflowCreateSchema`; `POST /reservations/:id/commands` writes; `POST /reservations/:id/preview` evaluates the same actions without writing.
- When changing commands, schemas, or previews, check the portal types and callers.

## Domain guardrails

- Use the [shared glossary](../../GLOSSARY.md) for statuses, billing, and room-inventory semantics.
- Saving and check-in allow unassigned reserved rooms; these still consume room-type inventory.
- Retained nights keep saved prices. Added nights use current rates; changing room type reprices that reserved room. Initial pricing uses the date's override, otherwise the base rate.
- Guests use `fullName`. Dated closures block rooms and reduce room-type availability. A room's housekeeping status is set only by staff; it never blocks check-in, availability, or assignment, and reservation workflows must not change it.
- Drizzle does not generate the business-rule triggers (originally `drizzle/0001_overlap_triggers.sql`). New migrations must preserve or deliberately replace their capacity, overlap, assignment, closure, and staying-guest guards. Keep `rethrowConflict` and portal error translations aligned with trigger abort messages.

## Complaint book

- `src/complaint-book.ts` owns every sheet write and its response status.
- `src/complaint-config.ts` merges two committed files: the guest-facing `packages/shared/src/complaint-book.json` (which the website prerenders) and the internal `src/complaint-book-operations.json`, which must stay out of the website.
- Changing `policyVersion` or the disclosures is a reviewed release change: each sheet stores the disclosures it was filed under.
- Response voids are append-only `complaint_response_voids` rows and cannot be changed or undone. New responses cannot set `correctsId`.
- Owner response attachments live in the private R2 bucket `pms-complaint-files`, bound as `COMPLAINT_ATTACHMENTS`.

## Test environment

Colocated `.test.ts` and `.test.mjs` suites use `vite-plus/test` and registered
migrations against in-memory `node:sqlite`; no running Worker is needed.
Like D1, the test database rejects statements with more than 100 bound parameters.
`createTestDb` signs in through the real login route once per role and clock instant
in a file, then copies that session row into later databases, so suites under one
fake time hash a password once. Use `login` from `src/test-support/auth.ts` when the
sign-in itself is under test.
