# Reservations

Read the [glossary](../GLOSSARY.md) for business language and
[the property calendar](property-calendar.md) before changing dates or defaults.
This guide owns the current API workflow and portal editing behavior.

## Commands and previews

Creation uses `POST /reservations` and the shared `workflowCreateSchema`.
Edits use `POST /reservations/:id/commands`; `POST /reservations/:id/preview`
evaluates the same actions without writing. These are workflow commands rather
than arbitrary field patches. Request schemas live in
[the shared package](../packages/shared/src/index.ts); portal types and fetch
helpers live in [api.ts](../apps/portal/src/lib/api.ts).

`POST /reservations/preview` prices a new reservation before it exists, using the
shared `workflowCreatePreviewSchema`: stay dates, each room's type and optional flat
nightly rate, the discount, and the rate plan. It returns `{ billing }` with each
room's nights and charges, subtotal, applied discount, total, `ratePlan`,
`requiredInitialPaymentCents`, and `remainingScheduledCents`, computed as creation
would save them. It does not check occupancy, room assignment, or availability, and
reserves nothing.

An existing reservation's preview returns `{ billing, validation: { issues } }`. A priceable draft returns
200 even when operational issues block saving. Issues identify fields and room
indices in the proposed rooms, excluding removed rooms. Invalid pricing inputs
return an HTTP error. A preview never reserves inventory.

Retained nights keep saved prices. Added nights use current rates; changing room
type reprices that reserved room. Initial pricing uses a supplied flat nightly
rate, then the date's rate override, then the base rate. `priceNights` in
[pricing.ts](../apps/backend/src/lib/pricing.ts) owns these rules. It applies the
reservation's accepted price adjustment to the override or base rate, rounding each
night to the nearest cent with exact half-cent ties upward in integer arithmetic.
A flat nightly rate is the final price and gets no adjustment. Totals sum the
rounded nights. Availability shows ordinary prices with no adjustment.

Each saved night (`reservation_room_nights`) stores its final price in `price_cents`,
which every total sums, and how that price was reached: `adjustment_cents`, the
accepted plan's [price adjustment](../GLOSSARY.md#rates-and-charges) (negative for a
reduction), and `discount_cents`, a staff discount on that night. The ordinary rate
is `price_cents - adjustment_cents + discount_cents`; it is not stored. A retained
night keeps all three values, and a repriced night is recomputed. Workflows save the
plan adjustment, which is zero under Flexible, and no night discount yet. The zero defaults describe nights from before migration `0010`
and inserts by an older Worker exactly. Responses expose only `priceCents`. Database
triggers reject a negative price or discount on insert or update, as
`night price cannot be negative`; saved rows are not revalidated.

## Rate-plan terms

The [rate plans](../GLOSSARY.md#rates-and-charges) are code-defined in
[rate-plans.ts](../apps/backend/src/lib/rate-plans.ts); there is no plan editor.
`GET /rate-plans` lists their terms, Flexible first.
Each plan composes a cancellation policy, a payment schedule, and a price
adjustment:

- **Flexible**: no price adjustment; a first-night deposit; free cancellation through
  the day 2 days before check-in, then a first-night charge.
- **Non-refundable**: a 10% price reduction; the full total upfront; a cancellation
  or no-show charge equal to the final total.

Each reservation stores a snapshot of the terms it was accepted under: plan,
cancellation-charge basis, free-cancellation days, payment schedule, and price
adjustment. The basis (`cancellation_charge_basis` in the
database, `cancellationPolicy.chargeBasis` in responses) is `first_night` or
`final_total`. It says what a [cancellation charge](../GLOSSARY.md#rates-and-charges) is
computed from; see [cancellation charges](#cancellation-charges). Changing a definition never
alters an existing reservation, and workflow commands do not change the stored
terms. `POST /reservations` takes an optional `ratePlan` (`flexible` or
`non_refundable`) and stores Flexible terms when it is omitted; an unknown plan is
rejected as `unknown rate plan`. No workflow command changes a reservation's plan.
A retried create request replays the saved reservation, so its adjustment applies
once. Column defaults give Flexible terms to rows
written without them: reservations from before migration `0006` and inserts by an
older Worker.

The payment schedule, cancellation policy, and price adjustment affect current
behavior: added and repriced nights use the stored adjustment.

Detail, list, and preview reads share `reservationBill` in
[workflow-billing.ts](../apps/backend/src/lib/workflow-billing.ts) and return
`ratePlan` (the stored terms), `requiredInitialPaymentCents`, and
`remainingScheduledCents`. A new read or preview that returns a bill uses
`reservationBill`; plain `bill()` serves only the list's balance filter, which has
SQL aggregates rather than nights. Detail and preview rooms take their
`subtotalCents`, `discountCents`, and `totalCents` from `roomCharges` in the same
module, and their nights expose only `date` and `priceCents`. The
[required initial payment](../GLOSSARY.md#rates-and-charges) for Flexible is the
sum of each reserved room's first saved nightly price, capped at the total after the
reservation discount. Full upfront requires the whole total. The remaining
scheduled amount is the total less the required initial payment. Both are zero for
a cancelled or No-show reservation, whose total is its final charge. Neither
depends on payments received; the balance still does.

The portal's creation form does not yet offer a plan or call the new-reservation
preview: it creates Flexible reservations and shows no scheduled amounts before
saving. Its total is a portal estimate: each room type's availability stay total,
less the capped discount.

## Online quotes

A [quote](../GLOSSARY.md#reservation-bill) fixes an online guest's price for 10
minutes without holding room inventory; availability is decided when a reservation
is saved from it. [quotes.ts](../apps/backend/src/quotes.ts) owns the behavior. No
route exposes it yet: the public checkout route (#105) builds on it and on
[online card payments](#online-card-payments).

`createQuote` takes the shared `quoteCreateSchema`: one room type, adults, children,
stay dates and a required rate plan. Clients cannot send prices, flat nightly rates,
discounts or terms. It requires a check-in after today in `PROPERTY_TIME_ZONE`
(`online check-in must be after today`), 1 to 60 nights, and occupancy within the
room type's maximums. Staff same-day and multi-room reservations are unaffected. The
quote prices nights with `price`, as staff creation does, and stores the nights and
the plan's terms in the `quotes` table with a random UUID and an `expiresAt` 10
minutes after server time. It returns the nights, `totalCents`,
`requiredInitialPaymentCents` (the amount to pay), `remainingScheduledCents`,
`ratePlan`, `expiresAt`, and `available`. `available` is advice from
`occupiedCounts`: an unavailable stay is still quoted, and a quote never blocks staff
reservations, closures or setup changes. Quotes reference no setup rows.

`saveQuote` saves a confirmed reservation with source `online`, the guest as booking
contact, one unassigned room, and the quoted nights and terms, even if rates or plan
definitions changed since, plus the payment that paid for it when one is given, in
the same batch. It goes through the existing room-type capacity triggers, so a full
room type fails with `no availability`; a save as `unfulfilled` holds no inventory
and so never does. It does not check
expiry: the caller decides whether an expired quote may still be saved, because a
charge may already have succeeded. `reservations.quote_id` is unique, so one quote
saves at most one reservation; a repeated or concurrent save returns the first
reservation's ID, even with different guest details.

## Online card payments

[payment-attempts.ts](../apps/backend/src/payment-attempts.ts) charges an online
guest's card for a quote through Culqi with 3DS, following the
[#113 resolution](https://github.com/meldarstudio/pms/issues/113) and the sandbox
evidence in #114. Cards only: no Yape and no webhooks. No route exposes it yet; the
public checkout route and waiting page are #105 and #106, and emails are #107. The
Culqi API v2 client is [culqi.ts](../apps/backend/src/culqi.ts); the key is the
`CULQI_SECRET_KEY` secret (`sk_test_` in the ignored `.dev.vars` locally) and is never
logged.

`startPaymentAttempt` takes the shared `paymentAttemptCreateSchema`: the quote ID, a
Culqi card token (`sourceId`), an optional Culqi3DS `deviceFingerprint`, and the
booking contact with a required email. The client never sends an amount: the server
charges the quote's `requiredInitialPaymentCents` in `CURRENCY`. It refuses, before
calling Culqi, a missing quote (`quote not found`), an expired one
(`quote has expired`), a missing key (`Culqi is not configured`, which also pauses
provider lookups and paid reservation saves), a phone the reservation could not be saved with, a quote already paid (`quote is already paid`), and a quote with an Unknown attempt
(`a payment for this quote is still being confirmed`). A new card replaces an attempt
waiting for 3DS. Each attempt is a `payment_attempts` row saved as `unknown` before
its single charge call, which always sends `capture: true`, the attempt ID as
`metadata.attempt_id` and the `x-api-version: 2` header. For Culqi's fraud checks it
also sends `antifraud_details`: the contact's first word as `first_name`, the rest as
`last_name`, the phone's digits as `phone_number` and the fingerprint, leaving out a
value outside Culqi's limits (names 2–50 characters, phone 5–15 digits) rather than
risk a refusal. A partial unique index lets one quote have only one open or
paid attempt, so concurrent starts cannot both charge.

Culqi's reply decides the attempt's `status`, and success is only a `201` charge with
outcome code `AUT0000` for the attempt's amount and currency; `paid` and `capture` are
ignored, as is any meaning of a `401`.

- `review`: a `200` `REVIEW` asks for 3DS. `authenticatePaymentAttempt` takes the
  Culqi3DS result (`paymentAuthenticationSchema`) and calls Culqi again for the same
  attempt with the same token and antifraud details, refusing an expired quote and an
  attempt not waiting for authentication
  (`payment is not waiting for authentication`). When the quote expires, polling,
  an authentication request or the scheduled Worker marks a remaining review
  `failed` with failure code `authentication_expired` and message `quote has expired`.
  This also runs without a Culqi key and makes no provider call. A continuation
  already sent to Culqi is `unknown`, not `review`, and remains eligible for charge lookup.
- `failed`: a `400` Culqi error is a clear decline, with its code and Culqi's
  `user_message` as `failure`. An expired 3DS review also fails as described above.
  The guest may try another card while the quote is valid; an expired quote requires a new quote.
- `unknown`: a timeout, network error, `5xx`, `429` or any other reply may still have
  charged. The API never charges a new token automatically. It looks the charge up by
  listing charges for the amount and email since the call (less a minute), matching
  `metadata.attempt_id` itself because Culqi ignores metadata filters: about 10
  seconds after the lost response (`lookUpLater` with `waitUntil`), on each
  `paymentAttemptStatus` poll, and from the scheduled Worker every minute, for 48
  hours after the call. A denied listing does not resolve it, because a sale shown as
  rejected can still have charged. After 2 minutes `delayed` tells the waiting page
  to say the outcome arrives by email. After 48 hours the attempt stays Unknown for
  staff to check in CulqiPanel.
- `succeeded`, then `saved`: the charge is recorded on the attempt, then
  `saveQuote` saves the reservation and a `card` payment with the Culqi charge ID as
  `culqiChargeId` and `reference`, dated the property's day of the charge call. The reservation is
  saved as Unfulfilled instead when check-in is before today, the same email (any
  case) already has an overlapping inventory-holding online reservation, or the
  room type has `no availability`. A failed save leaves the attempt `succeeded`;
  polls and the scheduled Worker retry it, and the unique quote and charge IDs keep
  it to one reservation and one payment.

`paymentAttemptStatus` returns the attempt's `id`, `quoteId`, `amountCents`,
`currency`, `status`, `delayed`, `failure`, and the saved `reservation` (`id`, `code`,
`status`) or null. The Worker's `scheduled` handler runs `reconcilePaymentAttempts`;
its `* * * * *` cron trigger in `wrangler.jsonc` takes effect only with a separately
authorized deployment.

`pnpm culqi:sandbox` runs the same flows against the Culqi sandbox: a captured charge
that keeps its antifraud details, the attempt-ID lookup, token reuse, an optional decline (`CULQI_DECLINE_CARD`) and a
S/1.00 refund read back from the charge. It reads `CULQI_SECRET_KEY` and
`CULQI_PUBLIC_KEY` from the environment or `.dev.vars` and refuses anything but
`sk_test_`/`pk_test_` keys. 3DS needs a browser, so it reports a `REVIEW` and stops.

## Stay dates and lifecycle

Each reservation has one `checkIn` and `checkOut` date shared by all its rooms.
These dates determine the booked nights, availability, and nightly charges.
Check-in and checkout actions change the reservation status. They do not record
separate arrival or departure timestamps or change the dates. For an early
departure, save the shorter date range together with the checkout status.

Staff may cancel a whole reservation, releasing its rooms and replacing its stay
charges with a [cancellation charge](#cancellation-charges). The reservation, its
nights, and its payments remain recorded. Removing an individual reserved room drops its charges
and releases its inventory while the remaining rooms keep the reservation's
status and stay dates. To release the last room, cancel the reservation.

Staff may instead mark a confirmed reservation `no_show` when the guest never
arrived. It is manual only: no arrival cutoff or automatic conversion exists. A
checked-in, checked-out, or cancelled reservation cannot be marked No-show, and a
No-show must be restored before it is cancelled. Like cancellation, No-show
releases the rooms, keeps the nights and payments, and replaces the stay charges
with a [policy charge](#cancellation-charges). The status, `statuses` filter,
and the charge record's `outcome` distinguish them; see the
[calendar](calendar.md) for which stays it shows.

`unfulfilled` ("Sin disponibilidad") is set only by an
[online card payment](#online-card-payments) whose stay can no longer happen. It
holds no inventory and has no cancellation charge, so its total is zero, the payment
is kept, and the whole payment is refund due, listed by `refund=due`. Staff cannot
set or leave it (`an unfulfilled reservation cannot change status`); they refund it.

## Cancellation charges

Cancelling or marking No-show from an inventory-holding status records a
cancellation with its `outcome` (`cancelled` or `no_show`), the time it was
recorded, the authenticated account, the free-cancellation deadline, and the
policy charge. The charge comes from the stored terms at server time, never from
the request:

- The deadline (`freeUntil`) is the date `freeUntilDaysBeforeCheckIn` days before the
  check-in date. A cancellation recorded on or before that date in `PROPERTY_TIME_ZONE`
  costs nothing: a Flexible stay checking in on 10 Nov cancels free until the end
  of 8 Nov. Terms without free cancellation have no deadline (`freeUntil: null`). A No-show
  has no deadline either: it always charges the basis below.
- After the deadline, `first_night` charges the first-night requirement (each
  reserved room's first saved nightly price, capped at the total after discount)
  and `final_total` charges the total after discount.

The cancellation charge replaces the stay charges in the bill. The balance is the
final charge less net money retained (see [refunds](#refunds)), and
`refundDueCents` is its positive excess. Detail, list, preview, and the list's
balance filter use the same final charge, so credit is refund due on cancelled
and No-show reservations as on any other. Neither records a payment or charges a card; a paid
Non-refundable No-show retains its payment with no refund due.

A `waive-cancellation-charge` action (`amountCents`, `reason`) reduces the active
cancellation or No-show charge, in the same command or later. Each
waiver records the amount, reason, time, and authenticated account; the original
policy charge is kept. Waivers together cannot exceed the policy charge, and a
reservation without an active cancellation rejects them. A waiver is neither a
payment nor a refund.

Reads return `cancellation`, the active cancellation with `policyChargeCents`,
`waivedCents`, `finalChargeCents`, `freeUntil`, `recordedAt`, `recordedBy`, and its
`waivers`, and `outcome`, or `null`; and `cancellations`, every cancellation and
No-show including restored ones. Reservations cancelled before migration `0007`
have no cancellation record and keep a zero charge; records from before `0008` read
`outcome: "cancelled"`. Migration `0011` converted accepted 48-hour terms to 2 days and
recorded deadlines, previously 15:00 instants, to their dates. Reservations still store the
old `free_cancellation_hours` and `check_in_time` for Workers from before `0011`;
nothing reads them. `cancelledAt` and `cancellationReason` remain
cancellation-only and are null for a No-show.

The cancellation, its waivers, and the status change are written in the command's
single batch under the revision guard. An idempotent retry replays the stored
receipt, and a concurrent retry loses the revision race, so neither duplicates a
charge or waiver. Cancelling an already cancelled reservation, or marking a No-show
again, records nothing new.

Restoring a cancelled or No-show reservation to an inventory-holding status
revalidates inventory like any restoration, marks the active record restored, and
bills the stay again under the unchanged plan. A rebooked room fails with
`room is already assigned for those dates`. The restored record and its waivers
remain in `cancellations` as inactive history; a later cancellation or No-show
computes a new charge. A reservation with any refund, requested, completed, or
failed, is refused with `reservation with refunds cannot be restored`; staff create
a new reservation instead. A reservation with any coupon movement, issued, redeemed,
or returned, is likewise refused with `reservation with coupons cannot be restored`.

## Refunds

Net money retained is the payments received less completed refunds. Refund due
(`refundDueCents`) is the amount still owed back after final charges, completed
refunds, coupon settlement, and agreed conversion to issued coupons on any
reservation: cancelled, No-show, waived, or amended to a lower total. Reads
return `paidCents` (gross received), `refundedCents` (completed), and
`pendingRefundCents` (requested), and `balanceCents` is the total less
`couponAppliedCents` less `paidCents - refundedCents - couponIssuedCents` (see
[future-stay coupons](#future-stay-coupons)). Requested and failed refunds change
neither the balance nor refund due.

Nothing refunds automatically. Staff return money manually through the actual
channel, or through Culqi for a Culqi card payment. Four workflow actions record it:

- `request-refund` (`paymentId`, `amountCents`, `method`, optional `reference`,
  `reason`) records a requested refund against a received payment with the request
  time and authenticated account.
- `request-culqi-refund` (`paymentId`, `amountCents`, `reason`) is "Reembolsar por
  Culqi": a `card` refund requested against a payment with a Culqi charge, sent to
  Culqi as described below.
- `complete-refund` (`refundId`, `refundDate`, `reference`) records that the money
  was returned on a property date no later than today, with the channel's
  reference.
- `fail-refund` (`refundId`, `reason`) marks a mistaken or failed request. Requests
  are never deleted.

Only a requested refund can be completed or failed; otherwise the command fails with
`refund is already resolved`. A request cannot exceed the refund due less amounts
in other requested refunds (`refund exceeds the refund due`), nor its payment's
amount less its completed and requested refunds (`refund exceeds the payment's
remaining amount`). Requested refunds never exceed the refund due: any other
change that would lower refund due below them, such as longer dates, an added
room, a smaller discount, or an edited payment, fails with `change leaves requested
refunds above the refund due` until staff fail the requests. Completing or failing a
request preserves the limit, so a command that only resolves refunds is never
refused for it. The checks run on the proposed state in the command's single batch
under the revision guard, so a concurrent request re-plans against the saved
refunds and an idempotent retry replays its receipt; neither can exceed the limit.
Restoring and requesting a refund in one command is refused like any restoration
with refunds.
A payment with any refund cannot be edited or deleted (`payment with refunds cannot
be changed`), including a refund requested earlier in the same command. A payment
with a Culqi charge ID is never edited or deleted (`Culqi payment cannot be
changed`).

### Culqi refunds

`request-culqi-refund` applies the limits above plus Culqi's: the payment must have a
Culqi charge (`payment is not a Culqi payment`), the amount must be at least 100
cents (`Culqi refund must be at least 100 cents`), and the payment may have no other
requested Culqi refund, including one earlier in the same command (`a Culqi refund
for this payment is pending`). Culqi has no refund idempotency, so this guards double
clicks. Without `CULQI_SECRET_KEY` the command fails with `Culqi is not configured`
before anything is saved.

The refund is saved as requested, with the payment's `culqiChargeId`, in the
command's batch. After that batch commits, `POST /reservations/:id/commands` makes a
single Culqi refund call for it; previews and replayed receipts make none. A `201`
with status `completa` completes the refund with Culqi's refund ID as
`completionReference` and `culqiRefundId`, the property's today as `refundDate`, and
the requesting account as resolver. Any other result, including a lost response, reads
the charge: if its `amount_refunded` equals the charge's other completed refunds
plus this one, the refund completes with the charge ID as `completionReference`.
Otherwise it stays requested, shown as "Reembolso pendiente", and staff check
CulqiPanel and record the outcome with `complete-refund` or `fail-refund`. The API
never retries a Culqi refund. Completing bumps the reservation revision, so a
command planned against the requested refund re-plans. The command response is the
reservation after the Culqi call.

Reads and previews return `refunds`, every request oldest first, with `status`
(`requested`, `completed`, or `failed`), `requestedAt`, `requestedBy`,
`resolvedAt`, `resolvedBy`, `refundDate`, `completionReference`, `failureReason`,
`culqiChargeId` (set for Culqi refunds), and `culqiRefundId` (Culqi's ID, when its
response returned one).

`GET /payments?from&to` keeps `totalCents` and `payments` as the gross payments
received by payment date. It adds `refundedCents` and `refunds`, the completed
refunds whose `refundDate` is in the range, each with its `paymentId`,
`reservationId`, `code`, `guestName`, `amountCents`, `method`, completion
`reference`, `refundDate`, and `reason`.
It also adds `couponMovements`, apart from cash, with `couponIssuedCents`,
`couponRedeemedCents`, and `couponReturnedCents`; see
[future-stay coupons](#future-stay-coupons).

## Future-stay coupons

A future-stay coupon converts some or all of a reservation's refund due into a
fixed value for a later stay, instead of returning money. Coupon value cannot be
exchanged for cash; the portal must say so wherever staff issue or redeem one. The
portal coupon screens are not built yet; the backend contract below is complete.

`issue-coupon` (`amountCents`, `guestAccepted: true`) records the guest's acceptance
and issues a coupon from the reservation. Without `guestAccepted: true` the command
fails with `guest acceptance is required`. The amount cannot exceed the refund due
less requested refunds (`coupon exceeds the refund due`); value already converted no
longer counts as refund due, so repeated issuances cannot exceed it. No bonus value
is added. Issuing is neither a completed refund nor money received: payments stay in
history, and `couponIssuedCents` removes the converted value from that reservation's
cash-refund obligation, so refund due falls by the coupon's value. A coupon has an
unpredictable 10-character `code`, its fixed `valueCents`, a `balanceCents`, the issuing
reservation, `issuedAt`, `issuedBy`, and `expiresOn`, 12 months after the property date of issuance (clamped
to the month's last day). After a reservation issues a coupon, its payments cannot be
edited or deleted (`payment cannot be changed after issuing a coupon`), including in
the same command.

`redeem-coupon` (`code`, `amountCents`) applies a coupon to a confirmed, checked-in,
or checked-out reservation. Staff enter any holder's code; case, spaces, and hyphens
are ignored. The server rejects:

- an unknown code (`coupon not found`, 404);
- more than the coupon's balance (`coupon redemption exceeds its balance`);
- more than the reservation still owes after the command's other changes (`coupon
  redemption exceeds the balance owed`);
- a coupon whose `expiresOn` is before the property's today (`coupon has
  expired`), so value returned after expiry cannot be spent;
- a stay whose check-in is after `expiresOn` (`stay starts after the coupon
  expires`), checked again whenever later edits move the dates while coupon value
  is applied;
- a second, different coupon on the same reservation (`reservation already uses
  another coupon`); the same coupon may be redeemed again up to its balance;
- the reservation that issued it (`coupon cannot be redeemed on the reservation that
  issued it`);
- a reservation that does not hold inventory (`coupon requires an active
  reservation`).

The new stay is priced under its own plan first. Redeemed value is a settlement
source, not a discount or money received: `couponAppliedCents` lowers
`balanceCents`, and `initialPaymentDueCents` is `requiredInitialPaymentCents` less
the settled amount (coupon applied plus net money retained not converted into issued
coupons), floored at zero.
`requiredInitialPaymentCents` stays the plan's requirement. A partial redemption
leaves the remainder on the coupon with its original expiry.

When a coupon-funded stay is cancelled, marked No-show, waived, or amended to less
than the coupon value applied, the charge consumes coupon value first, then money.
The excess is returned to the same coupon automatically as a `return` movement, and
refund due covers only money. Returned value keeps the coupon's original expiry, so
value returned after expiry stays expired.

Coupon balances carry their own revision. Each redemption or return claims the
coupon's revision in the command's single batch, so concurrent redemptions from
different reservations re-plan against the saved balance and cannot overspend; an
idempotent retry replays its receipt. A database CHECK keeps every balance between
zero and the coupon's value.

Reads and previews return `couponIssuedCents`, `couponAppliedCents`,
`initialPaymentDueCents`, `coupons` (the coupons this reservation issued, with
current balances), and `couponMovements` (this reservation's `issue`, `redeem`, and
`return` movements with `code`, `amountCents`, `recordedAt`, `recordedOn`, and
`recordedBy`). The list's `balance` and `refund` filters apply the same arithmetic.
`GET /coupons/:code` returns a coupon's value, balance, expiry, issuing reservation
(`sourceReservationId`, `sourceReservationCode`), and every movement with its
`reservationId`. `GET /payments` lists the movements whose property date
`recordedOn` is in the range, with `couponId`, `code`, `reservationId`,
`reservationCode`, `guestName`, `kind`, `amountCents`, `recordedOn`, and
`recordedBy`, and sums each kind. Coupon movements never enter `totalCents` or
`refundedCents`.

Lost-code replacement, reissue, expiry extension, stacking coupons, public
redemption, and undoing a movement are not supported.

## Reservation list reads

`GET /reservations` is authenticated and returns a bare reservation array by default.
`paginated=true` opts into `{ rows, total, limit, offset }`; omitted or
`paginated=false` preserves the array response. Defaults remain `limit=50`,
`offset=0`, and check-in ascending, then booking contact name ascending and code
ascending. Limits from 1 through 200 remain supported for existing callers.

Optional query dimensions combine with AND:

- `checkIn` and `checkOut` match exact business dates. Legacy `from`/`to` retain
  calendar overlap semantics: checkout is after `from`, check-in is on or before `to`.
- `status` retains the single-status filter. `statuses` accepts comma-separated
  `confirmed`, `checked_in`, `checked_out`, `cancelled`, `no_show`, and `unfulfilled`
  values,
  combined with OR.
  Omit both for unrestricted statuses; when both are sent, both restrictions apply.
- `balance=outstanding|settled|credit` selects positive, zero, or negative signed
  balances independently of status. A cancelled or No-show reservation's charges are
  its final charge, and an Unfulfilled one charges nothing, so payments beyond it are
  credit. The filter applies `bill()`,
  the billing policy that `reservationBill` uses for detail, list, and workflow reads.
  Completed refunds reduce the money counted against charges.
- `refund=due` selects reservations with refund due; `refund=requested` selects
  reservations with an unresolved refund request.
- `assignment=assigned|unassigned` selects reservations with every physical room
  assigned or with any unassigned reserved room, including partial assignments.
- `q` retains per-token booking-contact-name or reservation-code search; `guestId`
  retains exact booking-contact matching. Staying guests are not searched.
- `sort=checkIn|checkOut|guestName|balance` and `direction=asc|desc` choose one primary
  order. Contact name ascending and code ascending are deterministic tie-breakers
  when they are not already the primary key. Balance sorting uses signed cents.

Filters and ordering cover all matches before pagination. `total` is the exact
matching count even when the requested offset yields no rows. Charge and payment
aggregates remain independent; only the selected page's rooms, nights, and payments
are hydrated into response rows. The calendar uses its own dedicated read; see [calendar](calendar.md).

## Concurrent reservation saves

The reservation workflow loads the reservation, booking contact, room lines,
nightly prices, staying guests, and payments in one D1 batch. Commands commit
against internal reservation and contact revisions. Revisions are database
details and do not appear in request or response payloads.

If another command commits first, the stale attempt rolls back its entire batch,
including its request receipt and any payment or contact writes. The workflow
reloads the current state and reapplies the original actions, with at most three
attempts. Reapplication replaces the fields carried by each action; it is not
field-level merging. A contact action carries name, phone, and email, so saving
a name from an older draft can overwrite a concurrent phone edit carried in that
draft. Room-edit actions similarly carry type, assignment, and occupancy. Changes
outside the submitted action fields remain, such as contact notes omitted by the
contact action.
Actions that are no longer valid, such as editing a deleted payment, return their
ordinary validation error. Persistent contention returns 409 with
`reservation changed while saving; please try again`.

Booking contact edits also check the guest revision. The guest editor increments
that revision with its partial updates, so a reservation command cannot replace
concurrent guest notes with an older copy. Retrying a committed request ID still
replays the existing save without adding duplicate payments. Reusing that ID with
a different payload still returns 409.

The revision check deliberately fails the revision column's NOT NULL constraint
on a mismatch. A conditional update affecting zero rows would not abort the
remaining statements in a D1 batch. The workflow recognizes only these revision
constraint failures as retryable. Inventory conflicts retain their existing
trigger checks and error responses. The temporary `cancelled` status that permits
atomic room swaps remains inside the write transaction.

## Room validation at save time

The workflow decides which rooms need current-rule validation from the original
and proposed reservation states. Added or changed rooms, changed stay dates, and
restoration from `cancelled` or `no_show` to an inventory-holding status require
validation. Unchanged saved rooms can still accept payments, notes, discounts,
status corrections within inventory-holding statuses, and cancellation after a
room type's adult or child limit is reduced.

TypeScript preflight provides preview pricing and per-room issues. Database
triggers own the authoritative occupancy, room-type agreement, inventory, closure,
and overlap checks during writes. For restoration and changed dates, the workflow
updates each proposed room's type column to itself inside the write batch. This
runs the existing room-validity triggers even for unchanged room rows, without
rewriting their saved nightly prices. The final reservation update checks
inventory against the proposed dates and status.

The workflow bases that extra validation on the original state, before the
transaction's temporary `cancelled` release. Checking occupancy on every final
status update would reject ordinary saves of unchanged rooms. A concurrent room
type or assignment change can invalidate a successful preview or preflight; the
write then returns the existing 409 error and rolls back the entire command,
including its request receipt. Preview remains advisory and does not reserve
inventory or freeze room rules.

## Contact phones

A [contact phone](../GLOSSARY.md#reservations-and-dates) is optional on booking
contacts and staying guests. Each record keeps one nullable phone; records may
share a number, and nothing copies phones between a booking contact and its
staying guests. Validation is structural, using the maintained country metadata
in `libphonenumber-js`. It does not show the line exists or supports WhatsApp.

`normalizePhone` in `@pms/shared` applies the API rule, and `acceptPhone` in
`apps/backend/src/rules.ts` applies it to reservation creation, `contact` and
`set-guests` actions, and guest `POST`/`PATCH`. After request-schema parsing, a
submitted phone that equals the stored value is kept; any other nonempty phone
must be a valid number for its country. Request schemas trim surrounding
whitespace before this comparison. Arbitrary invalid legacy strings have no
byte-for-byte preservation or unrelated-save compatibility guarantee; submitted
values that differ after parsing must pass current validation.
Input without a leading `+` is read as Peruvian. Spaces, parentheses, dots, and
hyphens are accepted; landlines need their area code; extensions are rejected,
not dropped. Accepted numbers are stored in E.164 form, such as `+51987654321`.
Rejections return 400 with `X-Error-Field: phone`, roll back the whole command,
and use one of the English messages in `phoneErrors`. `null` clears a workflow
phone; guest `PATCH` cannot clear one.

The portal mirrors these rules in `apps/portal/src/lib/phone.ts`, since it does
not import `@pms/shared`. **Teléfono · Opcional** (`PhoneField`) is used in
creation, **Editar contacto**, and staying-guest add/edit. It pairs a searchable
country selector, defaulting to Peru and showing calling codes, with a `tel`
input. Country-specific grouping is visual: supported input keeps unformatted
digits in the draft, while `AsYouType` supplies spacing during typing and when an
editor reopens. `PhoneInput` applies the editing rules in
`apps/portal/src/lib/phone-mask.ts`: the caret stays attached to digits across
edits, including selection replacement. Backspace or Delete beside a separator
removes the adjacent digit; deleting a selected separator alone changes nothing.
IME composition text stays unformatted until the composition ends. For supported
phone syntax, copying or cutting a selection produces its digits and any `+`
without visual separators; the browser copies extensions and other unsupported
text as shown. National leading zeros are retained, not converted to a numeric
value. Typing or pasting a `+` number selects the country its calling code
identifies, even before the number is complete. A valid supported number then
shows only its national digits; incomplete international input keeps its `+`
prefix until it can be interpreted. Choosing a country keeps the national digits
and revalidates them; input containing extensions or unsupported text stays
intact so country changes cannot silently discard it. Errors follow the editor
reveal rules in
[Drafts, validation, and retries](#drafts-validation-and-retries), and a blank
phone is valid with no missing-phone warning. Editors open valid, explicitly
international phones with national grouping under their recognized country, including
numbers with accepted presentation separators, not just canonical E.164 strings.
Other values appear as stored, including annotations. Until staff change the
country or the text apart from separators, the portal resubmits the stored value,
and undoing an edit restores the stored text; API parsing and validation still
apply. Displays use international spacing and canonical `tel:` links for valid,
explicitly international phones without extensions or unsupported text; other
values are shown and linked as stored. Loading or displaying a phone does not write
to storage. Phone search is unchanged.

## Portal editors

Calendar bars open the compact `RoomBookingDialog` in edit mode. Its separate
**Ver reserva completa** action opens `ReservationPage`. The Reservations list
opens the full page directly. Both screens can create through **Nueva reserva**.

Creation keeps stay dates, reserved rooms, booking contact, notes, and discount in
one form. At least one room remains; every room shares the stay dates. Below
768px, creation uses a full-screen editor with a scrolling form body and reachable
title, close control, total, and **Cancelar / Crear reserva** controls. Mobile
room sections have numbered headings and **Quitar** only when multiple rooms remain.
Safe areas and keyboard viewport resizing preserve the draft; there is no swipe
dismissal. Controls follow the shared [Lyra styling](portal.md#control-styling).

### Full reservation page

`/reservations/:id` is a read-first overview. **Contacto principal**, **Pago y
cuenta**, and **Notas** occupy the left desktop column, with **Estadía y
habitaciones** on the right, matching the left column's height and scrolling its
room list when it would be taller; **Huéspedes** and **Pagos** cards follow side by
side. The sections stack on phones at their natural height. The shell header shows a
**Reservas › Detalle** breadcrumb; its **Reservas** link opens Reservations, and
list-origin links retain list filters. The page header shows the reservation code as
a small uppercase monospace label above the contact name, then status/date badges
and **Estado de la reserva**. The phone link appears only in the contact card.

**Editar contacto** corrects the existing name, phone, and email. It does not
search for or replace the contact. Document fields are omitted from contact saves
so existing stored values remain unchanged. Staying-guest documents are separate.
**Editar estadía** saves dates, room types, assignments, and occupancy together,
with availability checks and server billing previews. It excludes notes, guests,
payments, discount, and status. Contact editing needs no operational preview.
Each editor has an independent draft and save, centered on desktop and full-screen
on mobile, with reachable controls while the body scrolls.

The stay summary's **Ocupantes** adds declared adults and children across all
reserved rooms, independently of the named guest list. **Habitaciones asignadas**
shows the room count and a divided list with one line per room: room number/type,
then adult/child counts. Rooms sort by number, with unassigned rooms last as **Sin
asignar**. Occupancy editing stays in the stay editor.

The bill shows **Plan tarifario**, subtotal, discount including zero, total,
**Pago inicial requerido**, **Pago restante programado**, amount paid, and signed
balance. **Editar descuento** belongs to the discount row; **Registrar pago** is
separate. Outstanding, settled, and credit balances remain distinct. This is a
reservation bill. The discount editor previews the resulting bill 300 ms after
typing stops and enables saving only for a current preview without validation
issues.

**Notas** shows reservation notes with line breaks, or **Sin notas**, and opens the
notes editor through **Editar notas** or **Agregar notas**. Contact notes are not
shown.

**Huéspedes** and **Pagos** are cards like the ones above, each with an outline
header action: **Agregar huésped** or **Registrar pago**, beside the bill's own
**Registrar pago**. Both reuse the compact dialog's lists from
[reservation-records.tsx](../apps/portal/src/components/reservation-records.tsx) in
their framed form, bordered like **Habitaciones asignadas**: guests show an icon,
name, room, and document; payments show date, method, reference, and amount, newest
first, hiding the reference on phones. Empty cards show an icon with **Sin huéspedes
registrados** or **Sin pagos registrados**. Each row's **Editar** and **Eliminar**
open page editors; deletion asks for confirmation. Records stay editable on
cancelled reservations.

Selecting Confirmada, Check-in, or Check-out on an active reservation saves
immediately through the header status select. Cancellation and restoration open
consequence-aware confirmations with a current server bill and validation,
previewed immediately. The select shows the saved status, is disabled while any
save to the reservation is queued or running, and returns to the previous status
after failure. It is independent of the stay editor.

### Compact calendar dialog

The compact dialog keeps **Detalles / Huéspedes / Pagos**, a contact/status header,
and footer controls. Its header shows contact name, saved status, phone, and code,
without contact email. On mobile, **Ver reserva completa** moves into
**Más acciones de reserva**. The full-screen form body scrolls while header and
footer remain reachable; closing preserves the calendar and its scroll position.

The mobile footer has one bill accordion, with the colored balance bar at the
bottom and the full breakdown expanding upward above it. The breakdown includes
room charges, the editable discount, total, **Plan tarifario**, **Pago inicial
requerido**, **Pago restante programado**, and amount paid. Draft pricing previews
the scheduled amounts with the bill; there is no separate
bill card in the scrolling form body or repeated balance inside the breakdown.
It starts collapsed when a reservation opens and preserves its expanded state
across tabs. The breakdown scrolls within a bounded height so the balance and
action buttons remain reachable, including when the keyboard resizes the editor.
Collapsing or resizing keeps the discount draft mounted. Desktop keeps its full
summary with the balance at the bottom.

The balance toggle retains **Ver desglose / Ocultar desglose** accessibility names,
expanded state, and the controlled-panel relationship. An upward chevron means
collapsed and downward means expanded. Balance uses red outstanding, green
settled, and blue credit treatments with text labels. Draft pricing shows
**Vista previa** beside the label; unavailable pricing never falls back to stale
saved amounts. Total remains in the breakdown.

With dirty details, mobile shows **Descartar** and **Guardar cambios**; another
tab offers **Volver a Detalles** before saving. With clean details, the applicable
check-in/checkout action and **Cerrar** share the action row; without a lifecycle
action, **Cerrar** remains alone. Controls keep safe-area spacing and the shared
Lyra sizing. Desktop retains its inline full-page link and footer action menu.

**Guardar cambios** saves dates, rooms, and notes only. **Descartar cambios**, or
**Descartar** on mobile, resets that draft. Routine check-in/checkout saves
immediately and leaves details unchanged. **Más acciones de reserva** contains
**Cancelar reserva** and **Cambiar estado**. Active status corrections save
immediately; choosing an active status on a cancelled reservation opens **Restaurar reserva** for the chosen
status, previews the bill and availability, and writes only after confirmation.
Restoration success keeps the compact dialog open.

Dirty details, guest, payment, discount, or nested-editor drafts block check-in,
checkout, and status correction until saved or discarded. Dirty details, guest,
payment, and discount drafts also block restoration. Dirty guest, payment, or
discount drafts block cancellation. A dirty details draft permits cancellation:
the confirmation explicitly discards it, and closes the dialog only after
success. Dismissed or failed cancellation preserves it. The dialog's write
controls are disabled while any save to the reservation is queued or running,
including a discount autosave. A discount autosave sent after cancellation waits
for the cancellation to finish, so it reads the cancelled reservation.

### Reservation command module

Every editor on the full page, the page's status select, the compact dialog, and
calendar room assignment save an existing reservation through
[reservation-commands.ts](../apps/portal/src/lib/reservation-commands.ts).
Creation uses its own endpoint and does not.

- `useReservationCommands(id)` returns `send(actions)` and `saving`. `send` takes
  the workflow action list and never throws. It resolves to `saved` with the
  reservation detail, `rejected` with Spanish field errors keyed by form field
  name, or `failed` with one Spanish message and, when the server sent one, its
  English error `code` for callers that react to a specific error. Editors with
  no field to show a rejection use `unsavedMessage(result)`. `saving` is true
  while any save to that reservation is queued or running, whichever editor
  sent it.
- **Duplicate-safe retries.** A failed save keeps its request ID, keyed by
  reservation and the exact actions. Sending identical actions again reuses that
  ID, even from a reopened editor, so a retry after a lost response cannot record
  a payment twice. Success forgets the ID; a later identical save gets a new one.
  The memory lives in the query client, so clearing the cache, including sign-out
  after a 401, forgets it.
- **Ordering.** Saves to one reservation run one at a time in send order. Sending
  actions identical to a queued or running save joins it: no second request, and
  both callers receive the same result. Different reservations save independently.
  Clearing the cache (sign-out) drops saves still queued, which resolve as
  `failed`; a later send never joins a save started before the clear, and a save
  running across the clear does not write its result back into the cache.
- **Field errors.** The sent action types choose the mapping, from the same table
  as `serverFieldErrors` in [api-error.ts](../apps/portal/src/lib/api-error.ts),
  which creation and the stay draft preview use: payment actions map
  date, amount, and method; contact actions map email and phone; staying-guest
  actions map email, phone, and reserved room; stay-changing actions map the
  stay-length errors to checkout. Anything else, including unmatched codes, is a
  single message.
- **Refresh.** `send` resolves after the refresh. Success writes the saved detail
  to the reservation cache and refreshes reservation lists, availability,
  inventory, payments, the calendar, and every open bill preview for that
  reservation. A preview still loading is cancelled first, so its older bill
  never replaces the refreshed one. A contact change also refreshes the
  contact's other reservations.
- **Bill previews.** `useReservationPreview(id, actions, enabled)` returns the bill
  and validation issues for the discount and status editors; callers debounce.
  The stay draft keeps its own quote reuse but keys its queries with
  `reservationPreviewKey`, so saves refresh it too.
- **Room assignment.** `useRoomAssignmentCommand()` re-reads the reservation
  before saving, uses a new request ID on every attempt, and keeps no retry
  memory. It waits behind other saves to that reservation and uses the same
  refresh. See [calendar assignment](calendar.md#picker).

### Drafts, validation, and retries

Editors capture opening values so background reads cannot replace a draft. Failed
saves retain drafts; dirty dismissal asks for confirmation, and router navigation
and browser unload are guarded while dirty or saving. Lifecycle writes show
pending, success, and failure feedback. Retrying unchanged actions after an
uncertain response is duplicate-safe through the
[Reservation command module](#reservation-command-module). Check-in/checkout do
not change stay dates or require payment or physical assignment.

Room-type menus account for other reservations, closures, and other draft rooms.
The current choice remains visible, and changes wait for current availability.
Server previews still validate before saving. Validation runs on blur and submit,
then on change after a submission attempt. Room count and capacity validate on
change because they control previews. Known server errors appear beside fields;
other write errors use toasts. Query errors stay beside the content they block.

Portal forms use TanStack Form and local Zod schemas in
[reservation-form-schemas.ts](../apps/portal/src/lib/reservation-form-schemas.ts).
Details, staying guests, payments, discount, and cancellation have independent
forms; writes go through the Reservation command module. The shared
[use-stay-draft.ts](../apps/portal/src/lib/use-stay-draft.ts) owns stay draft values,
validation feedback, preview timing, reusable prices, and reset for the compact
and page stay editors. It also retains compact-editor notes. Leave and discard
guards, dirty tracking, and toast wording remain with their editors.

## Portal list

Below 768px, Reservas shows Llegadas, Salidas, En casa, and Todas las reservas in
a two-by-two grid. Results are tappable cards showing the booking contact,
reservation status, assigned rooms and missing assignments, stay dates, and
balance. Outstanding, settled, and credit balances retain explicit labels. A card
opens the full reservation page, which contains the phone, declared occupant
counts, total, and workflow actions. Returning retains the URL-backed list
context. At 768px and wider, the list keeps its table and horizontal view tabs.

Cards and table rows list assigned room numbers in numeric order. With more than
three, they show the first three and a count of the rest, such as
`108, 201, 204 +12`; the unassigned count always stays visible. Screen readers
receive every room number. On desktop the room cell stays on one line, and hovering
the count shows the full list. To open a reservation from a room number, use the
calendar: list search does not match room numbers.

The app header and Nueva reserva stay reachable while the list scrolls; see
[navigation](portal.md#navigation) for the mobile floating placement. View,
date, search, filter, and sorting controls scroll with the results. Mobile list
controls use the shared Lyra sizing. Llegadas and Salidas retain their
previous-day, date-picker, and next-day controls; desktop follows them with a
standalone Hoy, while mobile puts **Hoy** in the date picker's footer, which returns to
the property date and closes the picker. Search still matches the
booking contact or reservation code; En casa and Todas las reservas have no date
restriction.

The list re-reads on focus, reconnect, and after saves in this browser. Changes made on
another device while the list stays open and focused appear only after **Actualizar**.
On desktop it ends the view-tab row, after the date controls on Llegadas and Salidas;
on mobile it sits in the app header on every view, since Nueva reserva floats. It
re-reads the current view, keeping its search, filters, sorting, and page, and keeps
the results visible while they update. It spins only while a requested re-read runs.
It is disabled during any read and until the first results arrive; if that first read
fails, the page's own retry replaces the list.

Pagination shows the result range and total, 25/50/100 reservations per page with
50 as the default, and previous/next controls. On mobile, these buttons are
labeled Anterior and Siguiente. Changing pages or page size brings the start of
the mobile results into view after the requested results arrive, focusing the
first card when there is one. Existing
loading, updating, empty, and error/retry feedback remains available.

## Portal list filters

The **Filtros** button counts changed filter groups, not individual selections:
Estados, Saldo, and Asignación each contribute at most one. Defaults are relative
to the selected view, and the count is hidden at zero. Text search does not count;
its own clear button remains available. Applied filters are inspected and edited
inside the panel rather than in a separate row of chips.

Filters apply immediately and leave the panel open. **Restablecer** restores the
current view's default statuses, any balance, and any assignment, returning to the
first page. It preserves text search, view, selected day, sorting, and page size,
and is disabled when the three filter groups already match their defaults.

At least one status must remain selected; the final checked status is disabled
until another is selected. All four checked means unrestricted, including
cancellations. Legacy empty/`all` URLs and explicit four-status URLs restore that
same selection. Llegadas and Salidas default to Confirmada, Check-in, and
Check-out; Todas las reservas defaults to all four. En casa remains locked to
Check-in and hides the status selector. The desktop panel heading is visually
hidden but retained as its accessible name.

On mobile, Filtros opens a bottom sheet with a visible Filtros de reservas heading
and a Listo button. Its controls scroll within the available height; the heading
and Listo remain reachable. Listo closes the sheet and returns focus to Filtros.
There is no separate apply step. Desktop retains the filter popover. Search and
sorting stay directly accessible from the list in both layouts.

See [backend list reads](#reservation-list-reads) for API filtering and pagination,
[portal routing](portal.md#navigation) for view defaults, and
[the frontend testing policy](../CODING_STANDARDS.md#frontend-scope) before tests.
