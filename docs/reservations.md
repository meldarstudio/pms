# Reservations

This guide owns workflow invariants and editor behavior. Use the [glossary](../GLOSSARY.md)
for terms and [property dates](calendar.md#property-dates) for calendar semantics.
Request shapes live in [shared schemas](../packages/shared/src/index.ts); portal
types/fetch helpers live in [api.ts](../apps/portal/src/lib/api.ts).

## Commands and previews

Creation uses `POST /reservations` (`workflowCreateSchema`); edits use
`POST /reservations/:id/commands`. These are workflow actions, not arbitrary field
patches. `POST /reservations/:id/preview` evaluates actions without writing or
reserving inventory: priceable drafts return 200 with per-room validation issues
and `billing`, the proposed reservation in the [detail shape](#reservation-reads),
even when saving is blocked. Room indices refer to proposed, nonremoved rooms.
Invalid pricing inputs return an HTTP error.

`POST /reservations/preview` prices a new reservation using
`workflowCreatePreviewSchema`, as creation would save it. It checks neither
occupancy nor assignment/availability and reserves nothing.

[workflow.ts](../apps/backend/src/workflow.ts) owns reservation-command execution.
Routes validate input and supply the captured property date/account, currency, and
Culqi adapter. `executeCommand` returns saved detail after refund processing;
`previewCommand` returns proposed billing and validation without writing. Revision
retries and receipt handling stay internal to the module.

[pricing.ts](../apps/backend/src/lib/pricing.ts) owns pricing:

- Retained nights keep saved prices; added nights use current rates. Changing type
  reprices that reserved room.
- Initial nights use a supplied flat nightly rate, otherwise the date's override,
  otherwise the base rate. A flat rate is final and gets no plan adjustment.
- Other nights receive the accepted plan adjustment, rounded per night to cents
  with exact half-cent ties upward using integer arithmetic; totals sum rounded nights.
  Availability shows ordinary prices without the adjustment.
- Saved nights keep final `price_cents`, `adjustment_cents` (negative for a reduction),
  and staff `discount_cents`. Ordinary rate is final minus adjustment plus discount.
  Retained nights keep all three; repriced nights recompute them. Workflows currently
  save no per-night staff discount. Responses expose only the final price.
- Insert/update triggers reject negative final prices or discounts; they do not
  revalidate saved rows. Older nights/inserts receive zero breakdown defaults.

## Rate-plan terms

Definitions live in [rate-plans.ts](../apps/backend/src/lib/rate-plans.ts), listed by
`GET /rate-plans`; there is no editor. Flexible has no adjustment, a first-night
deposit, and free cancellation through two days before check-in, then a first-night
charge. Non-refundable reduces prices 10%, requires full upfront payment, and
charges the final total for cancellation/no-show.

Creation snapshots the plan's cancellation basis, free-cancellation days, payment
schedule, and adjustment. Omitted plans default to Flexible; unknown plans fail.
Later definition changes and workflow commands do not change accepted terms.
Retried creation replays the saved reservation rather than applying adjustment twice.

[reservation-bill.ts](../apps/backend/src/lib/reservation-bill.ts) owns the
reservation bill. `reservationBill` takes a loaded reservation and derives everything
else: release from status, accepted schedule, active cancellation charge after
waivers, completed versus requested refunds, and coupon settlement. Detail, list,
command checks, and edit previews use it; `stayBill` prices unsaved rooms (creation
preview, cancellation policy) and `quoteBill` a quote. The list filters and sorts
balance with `balanceCentsSql`, the same rule in SQL, kept beside the TypeScript and
tested against it; change both together. `unresolvedBillSql` builds the
[Unresolved bill](#reservation-list-reads) rule on it. New bill-producing reads must use this
module rather than summing money themselves. Flexible's required initial payment
sums each room's first saved nightly price, capped at total after discount; full
upfront requires total.
Remaining scheduled amount is total minus that requirement. Both are zero for
cancelled/no-show reservations and do not depend on payments received.

Portal creation offers the `GET /rate-plans` plans (Flexible by default) and prices
the draft with the server creation preview; see the
[compact calendar dialog](#compact-calendar-dialog). Existing reservations show their
accepted plan, and no editor changes it.

## Online quotes

[quotes.ts](../apps/backend/src/quotes.ts) creates ten-minute offers without holding
inventory. It has no public route yet. `createQuote` accepts `quoteCreateSchema`:
one type, occupancy, stay dates, and required plan—not client prices, discounts,
flat rates, or terms. Check-in must be after the property date; stays are 1–60 nights
and occupancy must fit the type. Staff same-day/multi-room behavior is unchanged.

The quote stores priced nights and accepted terms. Availability is advisory from
`occupiedCounts`: unavailable stays are still quoted. Quotes reference no setup
rows and block neither reservations, closures, nor setup changes.

`saveQuote` atomically saves an online reservation, booking contact, one unassigned
room, quoted prices/terms, and any supplied payment. Current rate/plan changes do
not alter it. Capacity triggers may reject a confirmed save; `unfulfilled` holds no
inventory and avoids that rejection. Expiry is the caller's decision because money
may already have been charged. Unique `quote_id` ensures repeated/concurrent saves
return the first reservation ID, even with different contact details.

## Online card payments

[payment-attempts.ts](../apps/backend/src/payment-attempts.ts) and
[culqi.ts](../apps/backend/src/culqi.ts) implement Culqi API v2 cards with 3DS, not
Yape or webhooks. No route exposes them yet. The provider contract follows
[#113](https://github.com/meldarstudio/pms/issues/113) and sandbox evidence in
[#114](https://github.com/meldarstudio/pms/issues/114).

`startPaymentAttempt` accepts `paymentAttemptCreateSchema`. The server charges the
quote's required initial payment in `CURRENCY`, never a client amount. Before any
charge it rejects missing/expired quotes, missing `CULQI_SECRET_KEY`, unsavable
phones, paid quotes, and quotes with an Unknown attempt. Missing configuration also
pauses lookups and paid reservation saves. Keys stay in secrets/ignored `.dev.vars`
and are never logged.

Each attempt is saved as `unknown` before its single charge call. The call sends
`capture: true`, `metadata.attempt_id`, and `x-api-version: 2`. Antifraud details use
the contact's first word/rest as first/last names, phone digits, and device fingerprint;
omit values outside Culqi's limits (names 2–50 characters, phone 5–15 digits).
A partial unique index permits only one open or paid attempt per quote. A new card
can replace a review waiting for 3DS.

Only a `201` charge with outcome `AUT0000` and matching amount/currency is success;
ignore `paid`, `capture`, and any supposed success meaning of `401`.

- **Review:** `200 REVIEW` requests 3DS. `authenticatePaymentAttempt` accepts
  `paymentAuthenticationSchema` and continues the same attempt/token/antifraud details.
  It refuses expired quotes or an attempt not waiting for authentication. Polls,
  authentication requests, and cron fail an expired review as `authentication_expired`,
  even without a key and without provider calls. A sent continuation is Unknown,
  not Review, and remains eligible for lookup.
- **Failed:** a `400` is a clear decline, carrying Culqi's code and `user_message`.
  Another card can be tried while the quote is valid; expiry requires a new quote.
- **Unknown:** timeouts, network errors, `5xx`, `429`, and other replies may have
  charged. Never charge again automatically. List charges by amount/email since
  one minute before the call, matching `metadata.attempt_id` locally because Culqi
  ignores metadata filters. Lookup runs after about ten seconds (`lookUpLater` with
  `waitUntil`), on status polls, and each minute from cron, for 48 hours. Denied
  listings do not resolve it: a sale displayed as rejected can still have charged.
  After two minutes `delayed` signals that the guest should await email; after
  48 hours it remains Unknown for staff to inspect in CulqiPanel.
- **Succeeded → saved:** persist the charge, then atomically save the reservation
  and card payment, using the charge ID as provider ID/reference and the property's
  day of the charge call as payment date. Save as Unfulfilled if check-in is before
  today, the same case-insensitive email has an overlapping inventory-holding online
  reservation, or capacity is gone. Failed saves remain Succeeded for polling/cron
  retries. Unique quote/charge IDs prevent duplicate reservations/payments.

`paymentAttemptStatus` reports attempt state, delay/failure, and any saved reservation.
The scheduled handler calls `reconcilePaymentAttempts` each minute; its configured
cron takes effect only with a separately authorized deployment.

`pnpm culqi:sandbox` requires `sk_test_`/`pk_test_` keys from the environment or
`.dev.vars`. It exercises capture/antifraud details, attempt lookup, token reuse,
an optional `CULQI_DECLINE_CARD`, and an S/1.00 refund read back from the charge.
3DS requires a browser, so the script reports Review and stops.

## Stay dates and lifecycle

One check-in/checkout range determines every room's nights, availability, and prices.
Check-in/checkout actions change status, not dates or arrival/departure timestamps.
For early departure, shorten dates and check out together. Neither action requires
payment or physical assignment; unassigned reserved rooms still consume type inventory.

Cancellation releases inventory and replaces stay charges with a policy charge,
keeping nights and payments. Removing one reserved room drops its charges/inventory
but leaves the other rooms' status/dates unchanged. Cancel to release the last room.

No-show is manual, only from confirmed—not checked in/out or cancelled. Restore it
before cancelling. It keeps nights/payments and applies the policy charge, like
cancellation; outcome/status distinguish them. Calendar visibility is [separate](calendar.md#calendar-read).

Unfulfilled is set only by online payment completion when the stay cannot happen.
It holds no inventory, charges zero, and keeps its payment as refund due. Staff
cannot set or leave that status; they refund it.

## Cancellation charges

Cancelling/marking No-show records the outcome, authenticated account, timestamp,
deadline, and policy charge under the command's revision guard:

- Free cancellation includes the property date `freeUntilDaysBeforeCheckIn` days
  before check-in: a Flexible arrival on 10 Nov cancels free through 8 Nov.
  No-show and terms without free cancellation have no deadline.
- After the deadline, `first_night` charges each room's first saved night, capped
  at total after discount; `final_total` charges that total. No-show always charges
  the basis. Neither action records payment or charges a card.
- `waive-cancellation-charge` reduces an active policy charge with a reason, in
  the same command or later. Keep original charge and waiver/account history;
  combined waivers cannot exceed it. A waiver is neither payment nor refund.

The final cancellation charge replaces stay charges/discount in all bills and
balance filters. Excess net retained is refund due, just as on an active stay.
Reads include active cancellation and all cancellation/waiver history. Pre-`0007`
cancellations keep zero charge; pre-`0008` outcomes read as cancelled. Legacy
hours/time columns remain written for older Workers but are not read; see
[rollout constraints](history/schema-rollouts.md).

Idempotent receipts and revision races prevent duplicate charges/waivers. Repeating
the current cancellation/no-show status records nothing new. Restoration revalidates
inventory, marks the charge record restored, and bills the stay under unchanged
terms. History remains, and a later cancellation computes a new charge. Any refund
record, even failed/requested, blocks restoration (`reservation with refunds cannot
be restored`), as does any issued, redeemed, or returned coupon movement
(`reservation with coupons cannot be restored`); create a new reservation instead.

## Refunds

Net retained is payments less completed refunds. Balance is total less
`couponAppliedCents` less net retained, plus `couponIssuedCents` (see
[future-stay coupons](#future-stay-coupons)); refund due is the magnitude of a
negative balance, on any reservation. Requested/failed refunds change neither.
Gross paid, completed refunds, and requested amounts remain distinct in reads.

Nothing refunds automatically. Workflow actions record manual returns or a Culqi call:

- `request-refund`: request an amount against a payment, with method, reason, and
  optional reference, recording time/account. Optional `completed: { refundDate,
  reference? }` records money already handed back: the refund is checked against the
  request limits below, then saved completed in the same action, with the requester
  as resolver at the same time.
- `request-culqi-refund`: request a card refund against a Culqi payment. It does not
  accept `completed`; Culqi refunds complete through their own call.
- `complete-refund`: record returned money with a property date no later than today
  and an optional reference. Completed refunds read `completionReference: null`
  when none was given, as does the refund `reference` in `GET /payments`.
- `fail-refund`: resolve a mistaken/failed request with a reason; never delete it.

Only requested refunds can resolve. Requests cannot exceed refund due less other
requests, or the payment less its completed/requested refunds. Changes that would
leave requests above refund due fail until staff fail the requests. Commands only
resolving refunds are not refused for this limit. Check the proposed state in the
same revision-guarded batch; concurrent/idempotent retries cannot exceed it.
Restoration plus a refund request is refused. Payments with any refund cannot be
edited/deleted, including a request in the same command; Culqi payments are immutable.

### Culqi refunds

Require a Culqi charge, at least 100 cents, no other requested Culqi refund for that
payment (including in the same command), and `CULQI_SECRET_KEY` before saving.
Culqi has no refund idempotency; this pending-request guard protects double clicks.

After the command batch commits, `executeCommand` makes **one** refund call per
newly requested Culqi refund, outside revision retries; previews and receipt
replays make none. A `201 completa` completes with Culqi refund ID as
completion reference and provider ID, property today as refund date, and requester
as resolver. Any other reply/lost response reads the charge: if `amount_refunded`
equals other completed charge refunds plus this request, complete with the charge
ID as reference. Otherwise retain Requested for staff to inspect in CulqiPanel and
complete/fail manually. **Never retry a Culqi refund automatically.** Completion
bumps the reservation revision; the response returns the post-call reservation.

Reads/previews retain request and resolution history and provider IDs. `GET /payments`
keeps gross payments by payment date separate from completed refunds by refund date,
and lists [coupon movements](#future-stay-coupons) apart from both.

## Future-stay coupons

A future-stay coupon converts some or all of a reservation's refund due into fixed
value for a later stay instead of returning money. Coupon value cannot be exchanged
for cash; the portal must say so wherever staff issue or redeem one. The shared
[payment form](#compact-calendar-dialog) supports redemption; issuing remains a
backend command until its page workflow is built.

`issue-coupon` (`amountCents`, `guestAccepted: true`) records the guest's acceptance
and issues a coupon; without it the command fails with `guest acceptance is
required`. The amount cannot exceed refund due less requested refunds (`coupon
exceeds the refund due`); converted value no longer counts as refund due, so repeated
issuances cannot exceed it. No bonus value is added. Issuing is neither a completed
refund nor money received: payments stay in history, and `couponIssuedCents` lowers
refund due by the coupon's value. A coupon has an unpredictable 10-character `code`,
fixed `valueCents`, `balanceCents`, issuing reservation, `issuedAt`, `issuedBy`, and
`expiresOn`: 12 months after the property date of issuance, clamped to the month's
last day. Once a reservation issues a coupon, its payments cannot be edited or
deleted (`payment cannot be changed after issuing a coupon`), including in the same
command.

`redeem-coupon` (`code`, `amountCents`) applies any holder's coupon to a confirmed,
checked-in, or checked-out reservation; case, spaces, and hyphens in the code are
ignored. The server rejects:

- an unknown code (`coupon not found`, 404);
- more than the coupon's balance (`coupon redemption exceeds its balance`);
- more than the reservation still owes after the command's other changes (`coupon
  redemption exceeds the balance owed`);
- a coupon whose `expiresOn` is before property today (`coupon has expired`), so
  value returned after expiry cannot be spent;
- a stay whose check-in is after `expiresOn` (`stay starts after the coupon
  expires`), rechecked whenever later edits move dates while coupon value is applied;
- a second, different coupon on the same reservation (`reservation already uses
  another coupon`); the same coupon may be redeemed again up to its balance;
- the issuing reservation (`coupon cannot be redeemed on the reservation that issued
  it`);
- a reservation that does not hold inventory (`coupon requires an active
  reservation`).

The new stay is priced under its own plan first. Redeemed value settles the bill; it
is not a discount or money received. `couponAppliedCents` lowers `balanceCents`, and
`initialPaymentDueCents` is `requiredInitialPaymentCents` (unchanged plan
requirement) less coupon applied and net retained not converted into issued coupons,
floored at zero. A partial redemption leaves the remainder on the coupon with its
original expiry.

When a coupon-funded stay is cancelled, marked No-show, waived, or amended below the
coupon value applied, the charge consumes coupon value first, then money. The excess
returns to the same coupon automatically as a `return` movement, and refund due
covers only money. Returned value keeps the original expiry.

Coupon balances carry their own revision, claimed by each redemption or return in the
command's single batch: concurrent redemptions from different reservations re-plan
against the saved balance and cannot overspend, and idempotent retries replay their
receipt. A database CHECK keeps every balance between zero and the coupon's value.

Reads and previews return `couponIssuedCents`, `couponAppliedCents`,
`initialPaymentDueCents`, `coupons` (coupons this reservation issued, with current
balances), and `couponMovements` (its `issue`, `redeem`, and `return` movements with
`code`, `amountCents`, `recordedAt`, `recordedOn`, and `recordedBy`). List `balance`
and `refund` filters use the same arithmetic. `GET /coupons/:code` returns value,
balance, expiry, issuing reservation (`sourceReservationId`,
`sourceReservationCode`), and every movement with its `reservationId`.
`GET /payments` adds `couponMovements` whose `recordedOn` is in range (`couponId`,
`code`, `reservationId`, `reservationCode`, `guestName`, `kind`, `amountCents`,
`recordedOn`, `recordedBy`) with `couponIssuedCents`, `couponRedeemedCents`, and
`couponReturnedCents`; they never enter `totalCents` or `refundedCents`.

Lost-code replacement, reissue, expiry extension, stacking coupons, public
redemption, and undoing a movement are not supported.

## Reservation reads

[reservation-read.ts](../apps/backend/src/reservation-read.ts) owns loading saved
reservations and presenting them as detail JSON. Detail, list rows, command and
creation responses, and command previews use it; new reservation reads must too.

- `loadReservations` reads each reservation with its contact, staying guests, rooms
  and nights, payments, cancellations and waivers, refunds, coupons, and coupon
  movements. It batches 80 reservations per D1 batch, under D1's 100 bound-parameter
  limit, and gives each reservation only the coupons it issued or moved. A missing
  reservation or booking contact fails the whole load with 404. `loadReservation`
  loads one; workflow commands plan against it.
- `presentReservations` adds room-type names and physical room numbers and
  housekeeping status, then presents each loaded or proposed reservation through
  [present.ts](../apps/backend/src/present.ts), which owns the bill call.

## Reservation list reads

`GET /reservations` defaults to a bare array; `paginated=true` opts into rows/count/
limit/offset. Check [the route](../apps/backend/src/routes/reservations.ts) and schemas
for parameter values/defaults. Filters combine with AND; `statuses` internally uses
OR, and sending it with `status` applies both restrictions.

- Exact check-in/checkout filters differ from legacy `from`/`to` overlap semantics:
  checkout after `from`, check-in on/before `to`.
- Balance filters use the signed `balanceCents` (final charges against net retained):
  `outstanding` > 0, `settled` = 0 and `credit` (Por devolver) < 0, independently of
  status. `unresolved` selects an [Unresolved bill](../GLOSSARY.md): refund due on any
  status, including Unfulfilled, or an outstanding balance on a checked-out, cancelled
  or no-show stay. Requested or failed refunds don't settle refund due, so those
  reservations stay listed. Its SQL predicate, `unresolvedBillSql` in
  [the bill module](../apps/backend/src/lib/reservation-bill.ts), is the shared rule
  for other callers; `paginated=true&limit=1&balance=unresolved` returns its count.
- Refund filters are kept for compatibility: `refund=due` matches `balance=credit`,
  and `refund=requested` matches reservations with a requested refund.
- Assigned means every reserved room has an assignment; unassigned includes partial
  assignments. Search matches booking-contact-name tokens/code, not staying guests
  or physical room numbers; `guestId` matches the booking contact.
- Sorting uses ascending contact name/code as deterministic tie-breakers, including
  for `sort=balance` in either direction. Every filter, the balance sort, `limit`/
  `offset` and the count run in SQL, so pages and the count cover all matches and the
  count remains exact even beyond the last page.
  Charge/payment aggregates are independent; [load and present](#reservation-reads)
  only the selected page. List rows add `guestName` and return empty `stayingGuests`;
  read the detail for staying guests. Calendar uses its own read.

## Concurrent reservation saves

`loadReservation` reads the reservation and all its records in one D1 batch. Commit against
internal reservation/contact revisions, absent from the API. A stale revision aborts
the whole batch, including receipts, contact changes, and payments; reload and reapply
the original actions, at most three attempts. Persistent contention returns 409
`reservation changed while saving; please try again`.

Reapplication replaces each action's fields, not field-level merging. An old contact
action can overwrite a newer phone because it carries name/phone/email, but preserves
omitted notes. The guest editor increments contact revision, protecting concurrent
notes. Invalidated actions return normal validation errors. A committed request ID
replays its save; reuse with a different payload returns 409.

Revision mismatch deliberately violates NOT NULL: a conditional update of zero rows
would not stop later D1 batch statements. Only revision-constraint failures retry;
inventory conflicts retain their trigger errors. Temporarily cancelling to release
inventory for atomic room swaps stays inside the transaction.

## Room validation at save time

Validate added/changed rooms, changed dates, and restoration from cancelled/no-show
against current rules. Unchanged rooms may still accept payments, notes, discounts,
status corrections within inventory-holding statuses, or cancellation after limits
are lowered.

Preflight produces advisory prices/issues; database triggers authoritatively enforce
occupancy, type agreement, inventory, closures, and overlap. Restoration/date edits
update each proposed room's type to itself to fire validity triggers without rewriting
prices. Final reservation update validates proposed dates/status.

Decide extra validation from the original state, before temporary cancellation.
Validating occupancy on every final update would reject unrelated saves. A race
after successful preview/preflight returns the existing 409 and rolls back everything,
including the receipt. Preview neither reserves inventory nor freezes rules.

## Contact phones

Phones are optional, nullable, and may be shared; booking contacts and staying guests
do not copy them to one another. `normalizePhone` in `@pms/shared` and `acceptPhone`
in [rules.ts](../apps/backend/src/rules.ts) enforce structural `libphonenumber-js`
validation on creation, contact/guest actions, and guest writes—not reachability.

Schemas trim before comparing with stored values. Equal submitted values are kept;
other nonempty values must be valid for their country. No byte-for-byte compatibility
is promised for arbitrary invalid legacy strings. Without `+`, assume Peru; allow
presentation separators, require landline area codes, reject extensions, and store
E.164. Invalid input returns a phone field error and rolls back the command.
Workflow `null` clears a phone; guest PATCH cannot clear it.

The portal mirrors rules locally in `phone.ts`. `phone-mask.ts` owns caret-aware
editing, composition, selection/copy behavior, and leading-zero preservation.
Country changes must not silently discard unsupported text. Valid international
values display with national grouping in editors and international spacing/`tel:`
links elsewhere. Unsupported/annotated values display as stored. Loading/display
never writes; until a meaningful edit, resubmit the stored text (undo restores it),
still subject to API parsing. Blank is valid; errors follow editor reveal rules.

## Portal editors

Calendar bars open compact `RoomBookingDialog`; the list and **Ver reserva completa**
open read-first `ReservationPage`. Creation is one form for dates, rate plan, rooms,
contact, notes, and discount; at least one room remains, with shared dates. Mobile editors
keep controls reachable while the body scrolls and protect drafts through keyboard/
safe-area changes; no swipe dismissal. Use [shared controls](portal.md#control-styling).

The staying-guest form, shared by the page and the dialog, asks for no room and never
sends a guest-room association. Detail, preview, and command responses omit it.
The strict shared request schema still accepts legacy `reservationRoomId` values
from open older portals, but commands ignore them. Migration `0016` removes the stored
association without removing guests; room removal needs no guest changes. Guest
identity, contact, and document editing remain independent of reserved rooms and
declared occupancy. See the separately staged
[two-release cutover](history/schema-rollouts.md#staying-guest-room-retirement-two-releases)
before deploying or migrating.

### Prices for newly reserved rooms

Creation and **Agregar habitación** in the dialog's Detalles and the page's stay
editor offer **Cambiar precio por noche** per unsaved room, on desktop and phone.
It reveals a final nightly amount in soles and an undo action; on phone the initial
button fills the content width. The value travels as that room's `nightlyRateCents`
in creation previews/requests or the command module's `add-room`, never as a
reservation discount. Rooms without it keep ordinary server plan pricing.

An opened but empty field is invalid, not an omitted price or zero. Amounts must
be nonnegative, at most S/ 10 000 000, and have at most two decimals; zero is valid.
Invalid prices suppress pricing requests and amounts and block saving. Errors
appear on blur/submit. Undo clears the value and its errors, restores the initial
button, and obtains ordinary server pricing before saving. Failed previews/saves
retain the draft; identical uncertain saves retain their retry request ID.

Saved rooms never expose this control, including immediately after saving an added
room. `edit-room` omits nightly pricing. A flat price applies only to initial nights;
extending a saved stay uses current rates for added nights, not the earlier flat price.

The phone dialog and stay editor's pricing summary shows type and room total, then nights × price
and occupancy. Varying nights read **Precio variable**, not a calculated average.
**Ver detalle** reveals server-priced nightly rows for varying prices or multiple
rooms. This summary never includes physical room numbers or **Sin asignar**;
assignment remains in the editable fields. Desktop summary presentation is unchanged.

### Full reservation page

Independent editors save contact, stay, notes, discount, guests, and payments.
Contact editing changes the existing contact, not its identity, and omits document
fields. Stay editing saves dates/type/assignment/occupancy together, excluding notes,
guests, payments, discount, and status. Declared occupant totals are independent of
named guests. Reservation notes are distinct from contact notes.
New rooms also accept the [final nightly price](#prices-for-newly-reserved-rooms).

The header offers the same contextual check-in/check-out
[lifecycle action](#compact-calendar-dialog) as the calendar dialog, including property-date
emphasis, dirty-room/balance confirmations and the 8-second Deshacer toast. Confirmed
stays offer check-in even before arrival; checked-in stays offer check-out; other
statuses have no contextual action. On phones, identity and the overflow menu precede
the status badges and full-width action; there is no fixed bottom page action.

The overflow menu replaces the status select. **Corregir estado…** opens a small
editor for another inventory-holding status and saves `set-status` on confirmation;
failure retains the choice. **Cancelar reserva** keeps the reason and current server
bill preview. Cancelled stays instead offer **Restaurar reserva**, with a destination
status and current server bill/availability validation. Restoration still warns before
entering a dirty room. Unfulfilled stays offer no status actions. Disable header status
actions while a page editor or changed discount draft is open, and while any reservation
save is queued/running. Guest/payment deletion requires confirmation; records remain
editable on cancelled reservations. See [phone editor sizing](portal.md#reservation-overlays)
for viewport, scrolling and draft protections.

Money lives in one full-width **Cuenta** card
([`reservation-account.tsx`](../apps/portal/src/components/reservation-account.tsx));
Huéspedes sits in the left column between Contacto and Notas. The accepted rate plan
is read-only stay metadata in Estadía y habitaciones, not a Cuenta row. Every amount is a backend
bill field; the portal does no bill arithmetic. The card follows its own width through
container queries, hiding Método and then Referencia in narrow Movimientos tables.

- **Summary:** active stays show Subtotal, the editable Descuento row (S/ 0 when none),
  Total and Pagado. Cancelled/No-show stays replace Subtotal/Descuento with the active
  cancellation's charge and one Cargo perdonado row per waiver (with its reason); their
  discount is hidden and not editable. Pagado con cupón, Reembolsado (completed refunds
  only) and Pasado a cupón (with each issued coupon's code and expiry) appear only when
  non-zero.
- **Descuento** opens the shared
  [discount popover](../apps/portal/src/components/discount-popover.tsx), which saves
  `set-discount` directly, without a bill preview. A failed save keeps the popover and
  its amount. Pristine editors follow refreshed saved discounts; changed drafts survive
  background reads. An open changed draft guards router navigation and browser unload.
- **Status line:** positive balance is Saldo pendiente with **Registrar pago** (plus
  Falta el depósito while the initial payment is short). Refund due beyond requested
  refunds is Por devolver; refund due that is fully requested is Reembolso solicitado;
  zero is Cuenta saldada. Requested and failed refunds never settle the bill. Only
  Saldo pendiente offers a payment action; the other states have none.
- **Movimientos:** payments, refunds and coupon movements as flat rows, oldest first, with
  no running balance. Payments keep edit/delete unless the backend would reject the
  change: Culqi payments (En línea, Tarjeta), payments with refunds, and every payment
  once a coupon was issued show a lock. Refund and coupon rows are read-only, with Solicitado or
  Fallido; a failed refund is muted and struck through.
- Cancelled and No-show stays show a destructive alert at the top: **Reserva cancelada**
  or **No se presentó**, the property-calendar date of the active cancellation, and the
  saved reason.

### Compact calendar dialog

The dialog keeps only everyday actions. Status corrections, cancellation, No-show,
and restoration happen on the full page; calendar bars never show cancelled stays.
The footer holds Cerrar, then Hacer check-in (confirmed) or Hacer check-out (checked
in); checked-out stays get Cerrar alone. The action is primary once its date has
arrived in the property calendar, outline before. The shared
[lifecycle action](../apps/portal/src/components/lifecycle-action.tsx) confirms a
dirty room before check-in and a positive saved balance before check-out (without
blocking it), then offers Deshacer in the success toast for 8 seconds, which sends
`set-status` back to the previous status. Undo checks the current screen's draft/save
guards, not their values when the toast appeared. It is disabled while those guards
apply. Any intervening status change permanently invalidates that undo, even if the
status later cycles back; leaving the editor/page also invalidates it. Cancellation
must never be restored through an earlier check-in/checkout toast.

Details save dates, rooms, and notes only, through Guardar cambios in the form; on
phones a dirty details draft replaces the footer actions with it. There is no discard
button: Cerrar, ✕, Escape, and **Ver reserva completa** ask before discarding. Each
tab shows a dot while its form has unsaved input; the independent discount draft shows
none. The compact edit dialog uses the same discount popover as the page, saving
`set-discount` only on Aplicar or Quitar and retaining failed drafts. Closing preserves
calendar position. On desktop, and
in the page's stay editor, rooms use the shared
[room row](../apps/portal/src/components/reservation-room-rows.tsx); the phone dialog
keeps one field per line.

Any dirty draft (details, guest, payment, discount, or a nested guest/payment editor)
blocks check-in/checkout. Disable writes while any save is queued/running, including
discount saves.

[`BookingSummary`](../apps/portal/src/components/booking-summary.tsx) shows the saved
or server-preview bill separately from creation: Subtotal only with a discount,
Descuento, Total, gross Pagado and nonzero coupon/refund rows. It uses the page's
account status, including the unpaid-deposit note, without plan/schedule rows. Draft
bills show preview state and never substitute stale saved amounts when unavailable.
On phones the footer accordion keeps its discount draft mounted through collapse/
resize; the coloured trigger is the sole balance display even when expanded. Its
upward-opening breakdown scrolls independently above the persistent footer actions.

Pagos shows the payment form only while the saved bill owes money. It defaults to
the full balance (the immediate post-creation cash suggestion still uses the required
initial payment), and shares the page's oldest-first, read-only refund/coupon movement
rows and payment locks. Unlocked payments retain edit/delete. Hidden forms stay
mounted so a background settlement does not discard an entered draft.
If settlement hides a changed payment draft, an explicit discard action clears
only that draft; movement corrections and unrelated drafts remain available.

The dialog and page share payment creation, including Método **Cupón**. It replaces
date/reference with a code lookup; codes ignore case, spaces and hyphens, and an
already-used code is prefilled. A valid lookup suggests the smaller of the saved
balance owed and coupon balance, never the deposit. Changed/in-flight or failed
lookups block redemption; lookup and amount failures stay inline. Editing a payment
does not offer Cupón. Coupon redemption uses the command module's duplicate-safe
retry and refreshes coupon reads; the server remains authoritative for concurrent
balance, expiry and eligibility changes. An exact uncertain redemption can still
replay its receipt when a newer lookup shows consumed value or changed eligibility;
changing its code or amount restores normal lookup validation. Creation has no coupon input.

Creation (`NewBooking`) sends the chosen `ratePlan` and optional
[per-room final nightly prices](#prices-for-newly-reserved-rooms), and shows only the current
`POST /reservations/preview` bill: Total, required initial payment, remaining
scheduled amount, and cancellation terms ([creation-summary.tsx](../apps/portal/src/components/creation-summary.tsx)).
While a changed draft is repricing or its preview failed (with Reintentar), the
summary shows no amounts and creating is disabled. Cancellation terms derive from the
preview's accepted policy and prices: the inclusive free deadline (check-in minus the
plan's days) while property today has not passed it, otherwise the actual charge (first
nights capped at total, or total); zero totals read as no charge. **Ver detalle** shows
nightly prices for several rooms or varying prices. The reservation discount is the
shared [discount popover](../apps/portal/src/components/discount-popover.tsx): only an
applied amount reaches the preview and request; the server caps it at the subtotal; an
override is priced before this reservation discount (S/ 95 × 3 − S/ 30 = S/ 255). An
open changed or invalid draft blocks creating. Room rows use the shared
[room row](../apps/portal/src/components/reservation-room-rows.tsx) layout.

Creating records no payment. The dialog stays open, switching to the new reservation
on Pagos with Importe prefilled from its required initial payment.

### Reservation command module

[reservation-commands.ts](../apps/portal/src/lib/reservation-commands.ts) owns all
existing-reservation writes, including calendar assignment; creation is separate.

- `useReservationCommands(id)` exposes `send(actions)` and shared queued/running
  `saving`, plus `canReplay(actions)` for exact uncertain attempts that must remain
  confirmable despite newer read validation. Results never throw: `saved`, `rejected` Spanish field errors, or
  `failed` Spanish message plus any server code. Editors without fields use
  `unsavedMessage`.
- Failed saves retain request IDs by reservation/exact actions, even across reopened
  editors, so lost-response retries cannot duplicate payments. Success forgets the
  ID; a later identical write is new. Memory belongs to the query client.
- Saves serialize per reservation; identical queued/running actions join one request.
  Different reservations are independent. Clearing cache drops queued saves as failed,
  prevents new callers joining pre-clear saves, and prevents running results repopulating cache.
- Action-specific field mapping shares `serverFieldErrors` in `api-error.ts` with
  creation/stay previews. Unmatched errors become one message.
- Resolve only after refresh. Success updates detail and refreshes lists, availability,
  inventory, payments, coupon lookups, calendar, and open bill previews; cancel loading previews first
  so an old bill cannot replace refreshed data. Contact edits refresh other reservations
  for that contact.
- `useReservationPreview` serves status editors; callers debounce. Stay drafts
  reuse quotes but share `reservationPreviewKey`, so writes refresh them too.
- `useRoomAssignmentCommand` re-reads the reservation, uses a fresh ID per attempt
  without retry memory, and shares save ordering/refresh. See [assignment](calendar.md#picker).

### Drafts, validation, and retries

Opening values isolate drafts from background reads. Failed saves retain drafts;
dirty dismissal, router navigation, and browser unload are guarded. Lifecycle writes
show pending/success/failure. Identical uncertain writes retry through the command module.

Room-type menus consider other stays, closures, and draft rooms; keep the current
choice visible and wait for current availability before changes. Server previews
validate before saving. Validate on blur/submit, then change after attempted submit;
room count/capacity validate on change to control previews. Field errors stay inline,
other write errors use toasts, and query errors stay beside blocked content.

Forms use TanStack Form/local Zod in `reservation-form-schemas.ts`. Independent
forms share `use-stay-draft.ts` for stay values, feedback, preview timing, price reuse,
and reset (plus compact notes); leave guards, dirty tracking, and toasts with editors.

## Portal list

List context lives in the URL and survives opening/returning from detail. Search
matches contacts/code, not room numbers; use calendar for room-number lookup. List
room numbers sort numerically, truncate visually after three, and retain the full
accessible list plus unassigned count. Mobile uses cards; desktop uses a table.

Focus, reconnect, and this browser's saves refresh the list. A continuously focused
view needs **Actualizar** for another device's changes. Refresh preserves data and
current filters/page; new-view failures use the shared error state, not unrelated
old rows. Pagination scrolls/focuses mobile results after the requested page arrives.

## Portal list filters

Filters apply immediately. The badge counts changed groups (status/balance/assignment),
not individual selections or search. Reset restores view-relative defaults and first
page, preserving search/view/day/sort/page size. Keep at least one status selected;
all selected means unrestricted. In-house locks checked-in and hides status selection.
Defaults/legacy URL parsing live in [route-search.ts](../apps/portal/src/lib/route-search.ts)
and `reservation-status-selection.ts`. Mobile sheets close without a separate apply step.

**Cancelada** requests both `cancelled` and `unfulfilled`, since Unfulfilled reads as
Cancelada; there is no separate option. **No se presentó** (`no_show`) shares
Cancelada's default selection, so daily views exclude both. URLs keep the portal's
status names; only the API request expands Cancelada. Saldo's **Por devolver** sends
`credit` and **Por resolver** sends `unresolved` ([Unresolved bill](#reservation-list-reads));
the list's Saldo cell labels a negative balance Por devolver. The portal does not use
the compatibility `refund` parameter.
