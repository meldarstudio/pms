# Reservation workflow implementation

Implements the first-version workflow in `RESERVATION_WORKFLOW.md`. The spec remains the source of business rules.

## Persistence and migration

Apply migrations 0007 through 0011 before starting this backend. Existing hand-written migrations remain intact. Only the local database has been migrated during development. Apply the same chain to `pms-preview` before staging deployment and to production only as part of a release.

Each room has its own booked dates, original dates and original nightly prices for new bookings, current billable nights, actual arrival and departure timestamps, and the start date of its current physical assignment. Reservation dates are a summary envelope for searching, not the source of availability. Timestamped before/after events preserve amendments, assignment changes, stay corrections and billing changes atomically. Financial corrections retain originals and link replacements through `replacesId`.

Legacy room discounts keep their recorded amounts. Discounts on rooms already cancelled at migration remain explicitly excluded and cannot reactivate. Old signed payments are copied once as `legacy_signed`; their signed effect is preserved without assuming negative values were refunds. The old rows remain untouched. Missing original dates, original prices, reasons and actual timestamps remain unknown, displayed as unavailable or not recorded. Migration tests verify unchanged balances and credits.

## API

The new portal and backend are a coordinated contract change. Removed mutation endpoints must not be used by older clients.

- `POST /reservations`: `{ requestId, guest, rooms, notes? }`. Each room includes `roomTypeId`, optional `roomId`, `adults`, `children`, `checkIn`, `checkOut`, and an optional initial `nightlyRateCents`.
- `POST /reservations/:id/preview`: `{ requestId, version, actions }`. Returns the proposed shared bill, rooms and final-settlement eligibility. Does not write.
- `POST /reservations/:id/commands`: the same command. Returns saved detail.
- `GET /reservations/:id`: current version, room dates and prices, bill, financial entries and timestamped history.
- `GET /reservations`: paginated search by guest/code, dates and room status, with shared balances.

Action schemas live in `packages/shared/src/index.ts`. Ordinary room edits, additions, staged removals, main-contact edits (`contact`), and staying-guest changes (`set-guests`) can share a command. Whole-booking cancellation must be its own command. Payments and adjustments may be combined with selected checkout through the API. The portal lets staff record them separately and then preview checkout.

Staying guests have their own records, distinct from the booking contact. Each has a required name and surname, optional contact/document fields, and a nullable `reservationRoomId` that must belong to this reservation. The relationship survives a change of physical room. Guest edits and their before/after history commit with the reservation version in the same transaction.

New payment entries require `paymentDate` as a valid UTC calendar date no later than today, plus a positive amount and method. `reference` is optional and limited to 200 characters. The entered date is separate from the server `createdAt` audit timestamp. Corrections retain the original entry and its date/reference. Migrations 0010 and 0011 add these fields, backfill legacy dates/references, and add database guards for guest-room ownership.

## Portal

Calendar bookings open quick edit with `Detalles`, `Huéspedes`, and `Pagos`. Common dates and the next ordinary check-in/out action apply to active rooms that agree. Different room dates and states remain visible; individual controls are under `Opciones por habitación`. The room dropdown stages an ordinary assignment before arrival or a move during occupancy. Changes are reviewed against the server's proposed bill before they commit.

The shared bill is read-only in `Detalles`; payment entry and financial corrections are in `Pagos`. The footer has `Cancelar reserva`, a contextual stay action, save/undo controls when needed, and `Ver reserva completa`. Dismissing unsaved edits asks before discarding them.

The reservation list and `Ver reserva completa` open a separate page with all three editing tabs plus `Historial`. Original/current dates, real timestamps, saved nightly prices, assignment changes, and less common room corrections belong there. No audit-history control is shown in quick edit. `UI_DESIGN.md` preserves the agreed direction and distinguishes the current page from future design work.

## Atomicity and retries

Every mutation carries a UUID request ID and the version last read. A database trigger verifies and increments the reservation version at the beginning of the same D1 batch as all changes. Distinct concurrent requests cannot both modify the same version. Duplicate requests return current detail without repeating effects; reuse with a different parsed payload returns 409. Creation is also idempotent.

All revised rooms are temporarily released within the transaction, then validated and restored in their final states. Availability, physical overlap, closures, assignment type and guest capacity have SQLite guards, including per-night capacity across different reservations. Failed batches roll back the version, request ID, room changes, money and history. Preview validation is advisory; commit-time triggers are authoritative.

The UI retains a command's request ID for retries after ambiguous network errors. A stale edit asks staff to reload rather than overwrite newer state. Creation, assignment, rooms and guest creation commit together, eliminating partial multi-action creation recovery.

## Financial decisions

Discounts apply oldest first, using creation time then ID for deterministic ties. Their recorded amounts stay fixed; applied amounts cap at remaining charges. Waivers apply afterward and retain a persistent applied amount. Charge reductions and added discounts shrink waiver application against remaining unpaid debt. Retired waiver application never grows back when charges return. Payments do not increase waiver application. Correcting a waiver cannot exceed its surviving applied amount; new debt requires a separate reasoned waiver.

Refunds are positive ledger amounts, limited to current credit. Void-and-replace computes the proposed corrected state before checking a replacement refund. A completed stay remains completed even when a correction creates debt. Corrections record what actually happened; they do not move money.

## First-version boundaries

Arrival, departure and moves record server UTC time when performed. Date amendments must precede arrivals outside booked dates and planned late departures. A same-day departure bills at least the arrival night while releasing availability immediately. Moves are same-type and immediate. Retrospective corrections outside saved dates, cancellation/no-show reversal, future moves, different-type in-stay upgrades, coupons and per-room payment allocation remain deferred as specified.

The application retains full before/after history. It does not infer historical physical occupancy from unavailable legacy timestamps. New assignment changes are timestamped in the event history.

## Verification

Run `pnpm test`, `pnpm --filter @pms/portal test`, `pnpm lint`, `pnpm typecheck`, and `VITE_API_BASE_URL=http://127.0.0.1:8788 pnpm build`.

Backend tests exercise actual Hono routes and SQLite migrations with transactional D1-style batches, including distinct concurrent writes. The suite covers final versus partial checkout, no-show charges, same-day release, pricing retention, type changes, assignments and closures, waiver retirement, cancellation after occupancy, reasoned corrections, refunds, duplicate requests and migration compatibility. Browser checks cover the local portal and its mobile breakpoint.

The UI implementation passed 78 backend tests and 63 portal tests, lint, typechecking, and a production build with the local API origin. Browser verification saved a separate local test reservation (`2NH9XP`, clearly named `Prueba UI Verificación local`), added a staying guest, recorded a dated payment with a reference, checked in, moved rooms using the dropdown, and checked out with a settled balance. The guest stayed linked to the booked room after the move; history showed both real timestamps and the assignment change. This completed test record remains only in the local development database. Preview and discard checks on seeded bookings did not save changes to those bookings.
