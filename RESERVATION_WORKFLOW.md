# Reservation workflow and implementation plan

## Status and purpose

This document records the workflow agreed with the user. It describes intended
behavior, not a claim that the application already implements it.

Use it as the starting point for future sessions. Inspect the current code before
implementing a section, and keep completed work distinct from planned work.
Implement the domain rules and backend tests before changing the UI.

Follow `AGENTS.md` for repository commands, migrations, deployment, and coding
conventions.

## First-version scope

- Reservations with one or more booked rooms.
- Individual room arrivals and departures within a shared reservation.
- Room-type changes before check-in.
- Same-type room moves during a stay.
- Reasoned corrections of mistaken check-ins.
- Reservation-level discounts and debt waivers.
- Individual-room and whole-booking cancellation.
- No-show handling chosen by staff.
- Guest credit and manual refunds against the original reservation.

Deferred features:

- Different-type room moves after check-in, including paid upgrades and downgrades.
- Coupons, expiry policies, and redemption of credit against future bookings.
- Separate bills or payment allocation per room.
- Automatic splitting or prorating of reservation discounts.

## Core concepts

### Reservation and booked rooms

A reservation owns the guest details, shared bill, payments, adjustments, refunds,
and credit. Each booked room owns its room type, guest counts, saved nightly
prices, assignment history, stay information, and status.

Status belongs to each booked room. The reservation's displayed status is derived
from its rooms and may be mixed.

### Room type and room number

Booking a room type reserves availability even without a physical room number.
`Sin asignar` means the physical assignment is empty; it does not cancel the
booked room or release its room-type availability.

Assigning a number must not count the same booking against availability twice.
Assignments must match the booked type and must not overlap other assigned stays
or dated room closures.

### Dates and prices

- Calendar dates use `YYYY-MM-DD` in UTC.
- Booked nights normally use `[checkIn, checkOut)`.
- A checkout day can be used for a new arrival.
- Preserve the existing maximum of 60 booked nights.
- Keep booked dates distinct from actual arrival and departure information.
- Support an individual room's early departure without changing the other rooms.
- Save nightly prices when booking. Later rate changes do not automatically
  reprice an unchanged stay.
- Money is stored as integer cents. Examples below use Peruvian soles.

Room-type changes before arrival deliberately reprice the affected room. Moving
to another room of the same type during the stay does not reprice it.

## Usual workflow

1. **Create the reservation.** Enter guest details, stay dates, room types,
   quantities, and guest counts. Validate availability and capacity, then save
   confirmed booked rooms and their nightly prices.
2. **Assign room numbers.** Staff may assign immediately or leave rooms
   `Sin asignar` until arrival.
3. **Record payments.** Record actual money received. A payment changes the
   balance independently of room status.
4. **Check in.** Require an assignment for each arriving room. Staff may check in
   rooms individually while the other rooms remain confirmed.
5. **Review departure and billing.** Record actual departure, remove unused future
   nights for early departure, and calculate the revised shared bill.
6. **Check out.** Allow checkout only when the revised reservation balance is zero
   or negative. Preserve the stay and financial history.

The normal room lifecycle is `confirmed -> checked_in -> checked_out`.
Cancellation is a separate action, not a normal departure.

## Room changes and corrections

### Before check-in

Confirmed rooms can change type, assignment, and guest counts.

Changing type must:

- Validate availability for the booked nights and capacity for the guest counts.
- Clear the old physical assignment.
- Reprice the affected room using the new type's current rates for those dates.
- Preserve the fixed reservation discount and recorded payments.
- Preview the revised bill before saving.

Selecting `Sin asignar` must clear the room number while preserving the booked
type, dates, prices, status, and room-type availability.

### During the stay

First-version room moves are limited to another physical room of the same type.

- Check that the replacement is available for the remaining stay.
- Keep the guest checked in and preserve dates and prices.
- Record the old room, new room, and effective move information.
- Preserve past assignment history and release the old room for the remaining
  stay after the move takes effect.
- Save the move atomically. A failed move must leave the original assignment
  intact.
- Do not leave a checked-in room unassigned.

Different-type moves remain deferred. Undoing check-in is not a workaround for an
actual room upgrade or departure.

### Mistaken check-in

Staff can undo an individual room's check-in if it was recorded by mistake and
the guests have not actually arrived.

- Require a reason and preserve the correction history.
- Return that room to `confirmed`.
- Preserve its assignment, prices, payments, and guest counts.
- Leave the other rooms' statuses unchanged.

### Accidental extra-room removal

Removing an extra confirmed room excludes its charges and releases availability.
Its saved booking history must remain available.

- Stage the removal with an undo option before saving.
- Preserve at least one active room through this accidental-removal control.
- Use deliberate cancellation when the intention is to cancel the booking.
- Removing an unsaved extra row does not create a saved cancellation.

## Multi-room arrivals and departures

### Partial arrival

Check in the assigned rooms whose guests have arrived. Other rooms remain
confirmed and continue reserving availability.

### Partial or early departure

Shorten only the departing room's stay. Remove its unused future-night charges,
preserve charges for the actual stay, and leave the other rooms' dates unchanged.
Keep the reservation discount fixed, subject to the applied-amount cap below.

The shared-balance rule applies to every checkout, including an individual room.
After calculating the departing room's revised charges, the whole reservation
must have no positive balance. This includes the other rooms' remaining booked
charges; first-version billing is not split by room.

### Same-day departure

Charge at least one night when a guest checks in and leaves that same day.
Record actual departure separately from this minimum billable night. Staff can
grant a reasoned discount or waiver. Full cancellation still waives all charges.

### Late arrival

Keep the original booked nights and prices when a guest arrives late. Record the
actual arrival without automatically removing previously reserved nights.
Staff can grant a discount with a reason if they choose to forgive unused nights.

## Checkout and shared balance

The backend must evaluate the final bill after saved adjustments and any
checkout-related price recalculation.

| Final reservation balance | Checkout |
| --- | --- |
| Greater than zero | Blocked; money is still owed. |
| Zero | Allowed. |
| Less than zero | Allowed; the guest has credit. |

- Check-in does not require full payment.
- Discounts and waivers saved alongside checkout must be applied before the
  balance check.
- A rejected checkout must leave the room checked in and must not partially
  commit checkout-related date, price, or status changes.
- If staff intend to forgive unpaid debt, they must record a reasoned waiver.
  Forgiving debt must never be represented as receiving a payment.

## Cancellation and no-show

### Whole-booking cancellation

`Cancelar reserva` is a separate destructive action for a saved booking. It is
independent of `Guardar` and does not save unrelated form edits.

- Require a reason.
- Allow cancellation before arrival, during the stay, and after checkout.
- Cancel every room in the booking and release any remaining availability.
- Waive all room charges, including nights already used.
- The bill becomes zero. Discounts and debt waivers have no applied amount
  against that zero bill, but their records remain in history.
- Preserve original booking details, prices, adjustments, reasons, and payments.
- Existing net payments become guest credit.
- Cancellation does not automatically record a refund.
- Repeated cancellation must not duplicate financial effects or credit.

Example: S/ 300 in room charges and S/ 200 received become zero charges and
S/ 200 in guest credit after full cancellation.

### Individual-room cancellation

Staff can cancel one room when the guests choose to keep the others, including
after that room's check-in.

- Require a reason.
- Waive all of that room's charges, including its used nights.
- Release its remaining availability and preserve its history.
- Leave the other rooms' statuses and dates unchanged.
- Keep the fixed reservation discount, capped to the remaining charges.
- Recalculate the shared balance and credit without changing payments.

Ordinary early departure uses revised dates and checkout, not cancellation.

### No-show

For a room whose guests never arrive, staff chooses the action case by case:

- `No se presentó`: release availability and retain the room's booked charges.
- Cancellation: release availability and waive the room's charges.

Require a reason for the chosen action. Preserve the other rooms and the shared
financial history. An automatic no-show deadline has not been agreed.

## Reservation-level discounts and waivers

Replace individual room discount fields with reservation-level billing records.

| Action | Meaning |
| --- | --- |
| `Aplicar descuento` | Reduce the agreed price, such as a long-stay discount. |
| `Condonar saldo` | Forgive money owed, such as a guest leaving without paying. |

Each record contains a fixed amount, its kind, a required written reason, and the
date recorded. Whitespace-only reasons are invalid.

### Discount rules

- Keep the recorded amount fixed when adding or removing rooms, changing dates,
  or changing physical assignments.
- Do not automatically split or prorate it between rooms or nights.
- Staff can explicitly revise it, preserving the original entry and reason in
  history.
- Limit the applied amount to the remaining billable charges. Keep the original
  recorded amount even when only part of it can be applied.
- An unused discount never creates guest credit.

Example: two S/ 200 rooms with a S/ 50 reservation discount total S/ 350. Removing
one room leaves S/ 200 in charges and the same S/ 50 discount, for a total of
S/ 150.

If S/ 100 was recorded as a discount but revised charges are only S/ 80, apply
S/ 80 and preserve the original S/ 100 entry and reason. Show the limited applied
amount clearly.

### Waiver rules

- Default the proposed waiver to the positive outstanding balance for staff to
  review.
- Require a reason.
- A new waiver cannot exceed the outstanding balance.
- Applied discounts and waivers together cannot exceed room charges.
- Preserve original room charges and actual payment records.
- Corrections must preserve adjustment history.

The allocation order when several adjustment records hit the applied cap is an
implementation decision still to define. The total must never become negative
because of discounts or waivers.

## Credit and refunds

Use these terms consistently:

```text
Bill total = room charges - applied discounts - applied waivers
Balance = bill total - payments received + refunds recorded
Guest credit = max(0, -balance)
```

Store refund amounts as positive business amounts, whether the implementation
uses separate refund rows or signed financial entries.

- Display negative balances as a positive `Saldo a favor`.
- Keep credit attached to the original reservation for the first version.
- Allow staff to record partial or full manual refunds.
- Each refund records its amount, method, date, and required reason.
- Reject zero, negative, and excessive refund amounts.
- Preserve original payments and show refunds as separate history entries.
- Prevent duplicate submissions from recording the same refund twice.
- Calculating credit does not mean money has been returned.

Example: S/ 300 in credit becomes S/ 200 after a S/ 100 refund, then zero after
refunding the remaining S/ 200.

Later, a coupon can convert some or all remaining credit into redeemable value.
That conversion must reduce refundable credit so the same amount cannot be
refunded and redeemed. Coupon issuance, redemption, and expiry are deferred.

## UI direction after the rules are implemented

- Keep `Tipo` and `Hab.` as the room type and physical assignment controls.
- Offer `Sin asignar` in `Hab.` for confirmed rooms. Remove the duplicate
  `Desasignar habitación` menu action.
- Keep an ellipsis menu for room actions and future extensions.
- Manage discounts and waivers at the reservation billing level.
- Give whole-booking cancellation its own destructive action, available from the
  details and payments sections.
- Cancellation must not be selectable as a normal status transition. Continue
  displaying `Cancelada` as the saved status when applicable.
- Provide a confirmation for deliberate whole-booking cancellation.
- Preview totals before ordinary edits are saved.
- Show reasons, recorded amounts, applied amounts, payments, refunds, and credit
  in the appropriate history and billing views.

## Test plan

### Normal flow and availability

- Creating a booking saves the guest, dates, room types, guest counts, and prices.
- Confirmed rooms consume room-type availability while unassigned.
- Assignment preserves the bill and does not double-count availability.
- Wrong-type, occupied, and closed-room assignments are rejected.
- Payments update the balance without changing stay status.
- Check-in requires an assignment for each affected room.
- Normal settled checkout preserves the stay and financial history.

### Multi-room and date exceptions

- Partial check-in leaves other rooms confirmed.
- Individual early departure changes only that room's stay and future charges.
- Every checkout checks the revised shared balance, including charges for rooms
  still staying.
- Same-day departure preserves the minimum one-night charge.
- Late arrival records actual arrival while preserving booked charges.
- Availability is released for the correct remaining dates without discarding
  past occupancy history.

### Room changes and corrections

- Before-arrival type changes use new rates and clear the old assignment.
- Capacity and availability failures leave the original booking intact.
- Unassignment preserves type availability and billing.
- Same-type moves preserve prices, remain checked in, and record assignment
  history.
- A failed move leaves the original assignment intact.
- Individual mistaken check-in correction requires a reason and preserves the
  other rooms' statuses and all financial records.
- Accidental extra-room removal cannot remove the last active room and can be
  undone before saving.

### Cancellation and no-show

- Full cancellation works for confirmed, checked-in, checked-out, and mixed
  bookings.
- Full cancellation waives used nights as well as unused nights.
- Individual cancellation waives only the selected room's charges.
- No-show retains charges while releasing availability.
- Reasons are required and retained.
- Discounts remain fixed after individual cancellation, subject to the cap.
- Payments are preserved and resulting credit is correct.
- Repeated requests do not duplicate waivers or credit.

### Adjustments, credit, and refunds

- Empty reasons, whitespace-only reasons, and invalid amounts are rejected.
- Discounts reduce the bill without changing payments.
- Fixed discounts survive room additions, removal, and date changes.
- Applied caps preserve the original recorded amounts and reasons.
- A waiver can settle unpaid debt and permit checkout.
- Excessive waivers are rejected.
- Correction history is preserved.
- Zero-charge bookings apply no discount and retain payment-derived credit.
- Overpayments do not block checkout.
- Partial and full refunds reduce credit correctly.
- Invalid or excessive refunds are rejected.
- Reopening the reservation preserves its credit and financial history.
- Concurrent or duplicate financial requests cannot refund the same credit twice.

### Atomicity, recovery, and UI

- Backend actions enforce the rules independently of UI validation.
- Failed checkout or cancellation cannot leave partially applied financial or
  status changes.
- A retry after a partial multi-action save does not repeat successful actions or
  duplicate booked rooms, payments, adjustments, or refunds.
- Closing an ordinary edit discards unsaved edits.
- Deliberate cancellation does not save unrelated form changes.
- Desktop and mobile flows expose the same supported actions and readable totals.

## Implementation order

1. Review this specification and settle the remaining implementation decisions.
2. Define pure billing and stay calculations and write meaningful rule tests.
3. Design the data changes for per-room stay information, assignment history,
   adjustment history, cancellation reasons, and refunds.
4. Implement migrations that preserve existing booking totals and history.
5. Implement backend actions, validation, atomic writes, and duplicate-request
   handling. Cover them with route and database tests.
6. Update portal API types and query hooks to match the backend contracts.
7. Build the UI around the verified actions and remove conflicting old controls.
8. Verify complete desktop and mobile workflows, including failed-save recovery.

### Migration and compatibility requirements

- Existing room discounts must retain their historical information and financial
  effect. Do not invent reasons for legacy entries.
- Preserve totals and balances during migration. Do not accidentally reactivate
  discounts from rooms already excluded from the bill.
- Preserve completed stays, payment history, and existing credits.
- Follow `AGENTS.md` when generating and applying migrations. Preserve the
  hand-written overlap triggers and validate them against any new date or
  assignment model.

### Relevant current entry points

- `apps/backend/src/db/schema.ts`: persistence model.
- `packages/shared/src/index.ts`: request validation schemas.
- `apps/backend/src/routes/reservations.ts`: booking and financial actions.
- `apps/backend/src/routes/reservations.test.ts`: route-level regression tests.
- `apps/backend/src/present.ts`: reservation response and financial presentation.
- `apps/backend/src/lib/quote.ts`: nightly pricing and stay changes.
- `apps/portal/src/lib/api.ts` and `apps/portal/src/lib/queries.ts`: client contracts.
- `apps/portal/src/lib/booking-prices.ts`: booking price previews.
- `apps/portal/src/lib/reservation-status.ts`: room and bulk status planning.
- `apps/portal/src/components/room-booking-dialog.tsx`: booking editor.
- `apps/portal/src/components/booking-summary.tsx`: totals and balance display.
- `apps/portal/src/components/reservation-payments.tsx`: payment entry and history.

The current model uses shared stay dates and per-room discounts. It needs domain
and persistence changes to support this plan; unlocking UI fields alone is not
sufficient.

## Decisions still to settle during implementation planning

These details have not been agreed and must not be treated as settled policy:

- How actual per-room dates and effective room-move information are represented.
- How room moves and arrivals outside the booked dates are handled.
- Which adjustment entries receive priority when the total applied amount is
  capped, especially after a bill with a prior waiver changes again.
- Whether positive balances created by post-checkout financial corrections are
  allowed, and whether they require a separate correction workflow.
- Whether individual-room cancellation after checkout has the same scope as
  whole-booking cancellation after checkout.
- Exact correction and reversal mechanics for adjustments and refunds.
- Exact bulk-action behavior for bookings with mixed room statuses.
- Whether cancelling the final active room redirects staff to whole-booking
  cancellation or records an equivalent booking-wide cancellation directly.
- Duplicate-request identifiers and transactional behavior for retries.

Resolve these against the agreed business rules without silently expanding the
first-version scope.
