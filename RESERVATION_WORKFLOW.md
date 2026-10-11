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
three-night price preview, and saves the details. Staff adds or edits a discount
in Pagos if needed to match the guest's agreement; that action saves separately.
Staff can also mark the stay checked out with the detail changes. The saved
three nights are the final stay record.

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
Room charges = sum of saved nightly prices of non-cancelled rooms
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

Cancellation removes room charges and releases availability. Preserve room
records, dates, payments, and discounts for reference. If all rooms are cancelled,
charges and applied discounts/waivers are zero. Payments remain in the balance
and payment report, with any legacy refunds deducted from credit. Show the
remaining amount as Saldo a favor until a refund is handled. Do not add refund
controls in this version. Restoring a cancelled room reapplies its saved charges
and discounts after validating availability.

No-show means the guest never arrived. It releases availability but retains
saved charges, discounts, payments, and the balance. Staff can add, edit, or remove
ordinary discounts to reflect the agreed no-show fee. Never mark no-show
automatically when the arrival date passes.

Example: a S/ 500 booking with a S/ 100 deposit receives a S/ 400 discount when
staff agrees to retain only the deposit. Its final no-show charge is S/ 100 and
balance is zero. A full discount waives charges; an existing deposit then becomes
client credit.

For mixed bookings, exclude only cancelled room charges while retaining shared
payments and discounts on remaining billable rooms, including no-shows. Payments
are not allocated to individual rooms. Apply no-show per room when only some
guests fail to arrive. Restoring a no-show to a status that consumes inventory
must check its dates and assignment against stays and closures.

## Saving and scope

- Guardar appears only in Detalles and saves room details, dates, status, and notes.
- Huéspedes uses an add/edit form above a compact list of registered guests.
  Agregar huésped and Guardar huésped save independently. Each row offers Editar
  and Eliminar. Editar opens a guest dialog with its own Guardar and Cancelar.
  Confirm discarding changed guest edits on close. Retain form inputs after
  errors and allow retrying the action.
- Payment and discount Add/Edit/Delete actions save on their own confirmation.
  Retain form values on failure and reuse the request ID when retrying an
  uncertain response. Do not clear unsubmitted payment fields on another save.
- Guest or payment saves must preserve unsaved Detalles drafts. Recalculate the
  details preview using the newly saved financial records without saving dates.
- Confirm discarding unsaved changes before leaving the editor.
- No staff-facing simultaneous-edit warnings or conflict-resolution workflow.
- Keep duplicate-submit protection for payments and saves. Transaction rollback
  must prevent a failed action from partly changing a booking or its payments.
- No new reservation edit history in this version. Preserve existing historical
  data and legacy columns; they do not control the editable final record.
- Do not deploy or reset remote databases as part of local implementation.

## Backend and portal implementation

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

The portal exposes these actions through the existing three-tab editor. Its
header, compact room rows, notes, right-hand summary, and footer retain the
agreed layout. Dates, room types, assignments, and occupancy remain editable
after arrival and departure. The room menu provides status corrections and
restoration of cancelled rooms; cancelled rooms can be shown when needed.
No-show rooms remain visible and billable while releasing availability.

Date and room edits preview charges and availability before saving in Detalles.
Guest additions, edits, and deletions save separately. Payments and discounts save through their own
Add/Edit/Delete controls in Pagos, without submitting detail drafts. Checkout
permits debt and changes the label without changing dates. Negative balances
display as client credit.
History, refund, waiver, settlement, and separate correction flows are absent
from the editor. Unsaved changes prompt before leaving. Billing helpers,
calendar occupancy, and status examples use final dates and the cancellation
and no-show rules above.

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
- Exclude cancelled/no-show rooms from inventory; retain no-show charges and
  cancelled-booking payments as client credit in financial totals
  while retaining records. Verify mixed-room behavior and restoration.
- Verify failed multi-action writes leave payments, rooms, and totals intact.
- Retry the same save without duplicate payments or rows.
- Reset sample data repeatedly without breaking constraints or migrations.

Payment references use uppercase in entry forms, displays, and saved data. Trim
surrounding whitespace when saving. Existing references are normalized by migration.
