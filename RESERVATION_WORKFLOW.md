# Reservation workflow

Last agreed: 2026-10-10.

This is the current product specification. It supersedes the earlier workflow
that required separate stay corrections, financial void-and-replace actions,
settlement before checkout, capped adjustments, and separate booked/actual dates.
Where UI_DESIGN.md or WORKFLOW_IMPLEMENTATION.md describes those older rules,
follow this document. Existing sketches describe layout, not business rules.

## Goal

Busy staff should use one ordinary reservation editor to keep the saved record
accurate. They can edit details, dates, room assignments, payments, discounts,
and arrival/departure labels after check-in or checkout. Do not introduce a
second correction workflow, required correction reasons, or a history interface.

## Stay dates, prices, and labels

Each booked room owns one editable check-in/check-out date range. The saved
range is the final record. Do not require staff to reconcile original booked
dates with a second actual stay range.

Dates are YYYY-MM-DD UTC calendar dates. Nights are [checkIn, checkOut).
Checkout morning is available for the next arrival. Keep the existing valid
stay limit of 1–60 nights, room-type capacity, guest occupancy, room-type matching,
and room closure checks.

Staff explicitly controls the label:

- Confirmed means the guest has not arrived.
- Checked in means the guest is here.
- Checked out means the guest has left.

Dates never automatically change the label. A label change never silently
changes dates, nightly charges, discounts, or payments. Recording a label late
must not price the stay using the time the button was pressed. Allow label
corrections through the same editor. Checked-in rooms require an assignment.

Saved dates determine dated inventory for confirmed, checked-in, and checked-out
rooms. A checked-out room retains its final historical nights in the calendar.
To release unused nights after an early departure, shorten the saved checkout
date. Merely changing the color/status does not rewrite the stay. Changes to
completed dates and restoration of inactive rooms must check availability too.

Date and room edits must have a server preview before saving. Show proposed
charges, total, balance, and conflicts. A conflict leaves the saved record intact
and lets staff correct the form. Saving must enforce the same constraints.

Retain saved nightly prices for retained dates of the same room type. Price new
nights using the current rate table, or base rate where no override exists. A room
type change prices the stay using the new type. A different physical room of the
same type does not change the price. Staff manages unusual rates in the existing
availability/rate table; no additional price override workflow is required.

Example: a five-night stay becomes three nights. Staff changes checkout, sees the
three-night price preview, adds or edits a discount if needed to match the guest's
agreement, and saves. Staff can also mark the stay checked out. Both changes can
be submitted in one command. The saved three nights are the final stay record.

## Multiple rooms

Shared dates and common arrival/departure actions are the default when the rooms
agree. Keep individual dates, assignments, and labels available for exceptions.
Editing one room must not change another room. Charges and payments share one
reservation balance. Guests remain attached to their booked room when its
physical assignment changes.

## Payments and discounts

Use ordinary Add, Edit, and Delete controls in Pagos. Editing updates the saved
entry. Deleting removes it from the current record and calculations. Do not ask
staff to void and replace an entry or give a correction reason.

Payments describe money actually received. Require a positive integer-cent
amount, a supported method, and a valid payment date that is not in the future.
Reference and notes are optional. Preserve creation time when editing an entry;
creation time is not its payment date.

Examples:

- Cash S/ 100 was entered as S/ 110. Edit the same payment to S/ 100.
- Payment was entered on the wrong reservation. Delete it there and add it to
  the correct reservation. Deleting an incorrect entry is not a refund.

Discounts are ordinary positive amounts in soles stored as integer cents. Staff
can add, edit, or delete them without a reason, balance cap, proration, or special
approval. Apply the full saved discount even when it exceeds room charges.
Staff will notice a negative balance and can correct a mistaken discount.

For active reservations:

```text
Room charges = sum of saved nightly prices of non-cancelled, non-no-show rooms
Reservation total = room charges - discounts
Balance = reservation total - payments
Client credit = max(0, -balance)
```

Legacy refunds, waivers, voided entries, and signed payments already stored must
keep their existing financial effects while records remain active. They are not
new staff workflows. New refund and waiver commands are disabled. Credit remains
as Saldo a favor; no refund controls or automatic money return in this version.

Editing payments or discounts recalculates the balance even after checkout.
Checkout is allowed with positive debt, zero balance, or client credit. Payment
changes never reopen a completed stay.

## Cancellation and no-show

Cancellation and no-show are soft deletions. Preserve the reservation, room
records, saved nights, and attached financial records for reference. They do not
consume inventory or contribute room charges to active totals.

When every room is cancelled or no-show, all computed booking totals, paid
amount, balance, and credit are zero, and its payments are excluded from the
active payment report. Attached payment records remain readable. This exclusion
does not mean staff returned money.

For a mixed booking, exclude cancelled/no-show room charges while keeping shared
payments and discounts on the remaining billable rooms. Payments are not
allocated to individual rooms. A reservation with remaining confirmed,
checked-in, or checked-out rooms is still financially active.

Staff can correct an inactive label. Restoring the room must validate its saved
dates and assignment against other stays and closures before committing.
Whole-reservation cancellation retains a simple deliberate confirmation.

## Saving and scope

- Confirm discarding unsaved changes before leaving the editor.
- No staff-facing simultaneous-edit warnings or conflict-resolution workflow.
- Keep duplicate-submit protection for payments and saves. Transaction rollback
  must prevent a failed action from partly changing a booking or its payments.
- No new reservation edit history in this version. Preserve existing historical
  data and legacy columns; they do not control the editable final record.
- Do not deploy or reset remote databases as part of local implementation.

## Backend implementation and portal follow-up

The backend uses the existing per-room dates, statuses, saved nightly prices,
and financial_entries table. No table/column rewrite is needed. Migration
0013_final_stay_dates replaces inventory triggers so checked-out rooms retain
their final dates and assignment_start does not override saved check-in.

POST /reservations/:id/preview and POST /reservations/:id/commands accept the
same action payloads. New ordinary actions are:

- edit-room: edit room type, assignment, counts, and final dates in any status.
- set-status: set a room's confirmed/checked_in/checked_out/cancelled/no_show label.
- financial: add a payment or discount.
- edit-financial: update the existing payment or discount by entryId.
- delete-financial: remove the existing payment or discount by entryId.

Existing check-in, check-out, cancellation, and room actions remain accepted as
compatibility entry points. They follow the final-date and debt rules above.
correct-financial, new refunds, and new waivers return validation errors.
Command requestId still protects retries. A client's stale version alone no
longer rejects a normal edit; the existing database version guard remains an
internal transaction check. A genuinely overlapping concurrent commit may still
fail rather than partially overwrite data.

The portal still needs to expose these actions and remove its older restrictions,
refund/waiver/correction controls, history controls, and settlement messaging.
Its date previews, status examples, billing helpers, room assignment logic, and
tests must follow these rules. Backend completion does not mean that UI is done.

## Required verification

Exercise the actual routes and full SQLite migration chain, including:

- Shorten and extend checked-in and checked-out stays; preserve unrelated rooms.
- Retain prices for existing nights and quote added nights at current rates.
- Save edited dates plus a discount and checkout together, including debt.
- Correct labels without automatically changing dates or prices.
- Reject overlapping room dates, closures, overcapacity, and invalid assignments
  in previews and commits, including reactivated and completed stays.
- Edit S/ 110 to S/ 100 in place; update payment date/reference/method; delete a
  wrongly attached payment and enter it on another reservation.
- Reject invalid amounts/dates and attempts to edit another booking's entries.
- Add/edit/delete uncapped discounts; preserve negative balances and credit.
- Exclude cancelled/no-show bookings from inventory and active financial totals
  while retaining records. Verify mixed-room behavior and restoration.
- Verify failed multi-action writes leave payments, rooms, and totals intact.
- Retry the same save without duplicate payments or rows.
- Reset sample data repeatedly without breaking constraints or migrations.
