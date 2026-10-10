# Reservation UI direction

> Business-rule update, 2026-10-10: RESERVATION_WORKFLOW.md supersedes the older
> correction, checkout settlement, actual-date, history, and refund requirements
> below. Keep this document for layout direction; the simplified portal controls
> still need implementation.

Last updated: 2026-10-10.

## Purpose and current status

This document preserves the user's UI decisions from the reservation design
conversation. Read it before changing reservation screens.

The user was unhappy with the UI produced during the backend/workflow rewrite.
The conversation then moved to planning with simple sketches. The agreed
direction is a familiar, compact reservation dialog for staff, with a separate
reservation page for the complete record.

The user authorized implementation after this design conversation. The portal
now implements the three-tab quick-edit dialog, guest records, payment dates and
references, and a separate reservation page. The saved sketch remains a design
reference with illustrative controls and sample data.

- [RESERVATION_WORKFLOW.md](RESERVATION_WORKFLOW.md) defines domain behavior.
- This document defines the UI direction and what should be prominent.
- [WORKFLOW_IMPLEMENTATION.md](WORKFLOW_IMPLEMENTATION.md) records the API,
  migration, and verification details. Inspect the actual code before changing it.
- [AGENTS.md](AGENTS.md) defines repository conventions and commands.

Keep the backend's support for individual stays and exceptions. Simplifying the
interface does not mean removing those capabilities or changing business rules.

## What the user wants

The user's main concern is that accommodating every edge case made the interface
too complicated for hotel staff. Most reservations follow the agreed dates, and
rooms on the same reservation usually arrive and depart together.

Design the default view around that common workflow. Staff should be able to
understand a reservation, change ordinary booking details, record payments, and
check guests in or out without understanding the full domain model.

The user likes the simplicity of Little Hotelier's reservation editor and their
own earlier UI. Use that familiar arrangement as inspiration. Exact colors,
spacing, and every field in Little Hotelier are not requirements.

Principles:

- Show frequently used fields and actions first.
- Use shared dates and common actions when the rooms agree.
- Put individual room exceptions behind `Opciones por habitación`.
- Make differences visible when they matter. Do not hide a mixed stay behind a
  misleading common date or status.
- Keep the reservation's shared balance easy to see.
- Put payment actions in `Pagos`.
- Put audit logs and detailed historical information on the reservation page.
- Preserve records when correcting or cancelling a booking.
- Continue with small sketches when a layout decision needs discussion. Do not
  restart a broad UI rewrite based on assumptions.

The user wondered whether deleting and recreating reservations would have been
easier for exceptions. Treat that as frustration with UI complexity, not a
decision to replace the existing cancellation, correction, or history rules.

## Two places to work with a reservation

| Place | Purpose | Content |
| --- | --- | --- |
| Quick-edit dialog | Everyday work directly from the calendar. | Common booking details, guests, payments, room assignment, check-in/out, cancellation, and selected individual room options. |
| Reservation page | View the complete record and handle less common work. | All reservation information, audit history, assignment history, actual arrival/departure timestamps, and less common controls. |

The reservation page is an agreed direction, but its layout and exact controls
have not been designed. A reservation table was discussed as a way to open it;
the table's design is also open.

The dialog footer now has a working `Ver reserva completa` link. The reservation
list also opens the full page. Navigation uses the app's existing tabs; no URL
router has been added.

### Calendar behavior

Clicking a booked room in the calendar opens the reservation quick-edit dialog.
It represents the whole reservation, including its shared bill.

We explored opening a separate room-focused dialog instead. The concern was that
rooms do not have separate balances, making it harder to understand payment and
checkout requirements. The current direction returned to a reservation dialog.

Highlighting the clicked room is a possible convenience. It must not suggest
that the shared balance belongs to that room. The exact highlight is undecided.

## Quick-edit dialog layout

Use these three tabs, in this order:

1. `Detalles`
2. `Huéspedes`
3. `Pagos`

The rough desktop structure is:

```text
Editar reserva · booking code · current status

Detalles | Huéspedes | Pagos

+----------------------------------+------------------------+
| Active tab                       | Resumen de reserva     |
|                                  |                        |
| Details normally show:           | Room charges           |
| shared check-in / check-out      | Total                  |
| compact room rows                | Pagado                 |
| Opciones por habitación          | Saldo pendiente/crédito |
| contact and simple notes         |                        |
+----------------------------------+------------------------+

Ver reserva completa       Cancelar reserva   contextual action
                                             Guardar changes
                                             when needed
```

This is a structural guide. Button order, responsive layout, and visual styling
can be refined. On narrow screens, stack the content and summary without losing
the current tab or important actions.

### Detalles

The default view includes:

- Shared booked check-in and check-out dates when all relevant rooms agree.
- Compact rows for booked rooms.
- Room type and physical room assignment, with `Sin asignar` where allowed.
- Adult and child counts.
- An add-room control.
- Main booking contact, including name, surname, email, and phone.
- A simple notes field.
- A read-only reservation billing summary.

The earlier UI and Little Hotelier reference put dates above rooms, contact
below, and the summary beside the form. This is the preferred starting point.

The main contact is the person associated with the booking. They are not
necessarily a person staying in a room.

No charge-payment or record-payment control belongs in `Detalles`. The summary
can show the balance there; recording money happens in `Pagos`.

### Shared dates and individual room options

Shared controls are a convenient view over the individual booked-room data.
Each booked room still owns its dates and stay status.

- A common date edit applies to the intended rooms as a deliberate booking
  amendment, subject to availability and pricing rules.
- If room dates differ, display that fact and make the individual dates easy to
  inspect. Do not silently replace them with the reservation's date envelope.
- `Opciones por habitación` is collapsed in the usual case.
- Individual options can expose dates, stay state, and cancellation of that
  room's stay.
- Cancelling a room's stay is a useful separate action. Cancelling the last
  active room must follow the whole-reservation cancellation rules.
- Remove history controls from this section. The user explicitly removed
  `Historial y tiempos reales` from the quick-edit sketch.

The user expects changing a physical room to start with choosing another room
in the room dropdown. Avoid requiring a separate move workflow as the normal
entry point. The operation still needs the correct backend validation and
confirmation for the room's current state.

The implementation uses the room dropdown for moves. The separate
`Cambiar habitación` action in the sketch is superseded. An occupied room's
assignment change becomes a move command and goes through the server preview.

### Check-in, checkout, and room states

Use a contextual action for the next ordinary step, such as `Check-in` or
`Check-out`. The common case handles the rooms arriving or departing together.

Individual arrivals and departures remain available through the room options.
Do not make staff select rooms or manage a bulk-action toolbar for an ordinary
single-room reservation or a reservation whose rooms move together.

Mixed states must be understandable. For example, one room may be in house while
another remains confirmed. A displayed reservation status is a summary of room
states, not a replacement for them.

Keep the shared-balance rules from `RESERVATION_WORKFLOW.md`:

- A partial checkout can retain debt while another room remains active.
- Final checkout requires the revised balance to be zero or credit.
- Payments change the bill independently of room state.
- Date amendments and extensions must be saved and validated before actions
  that depend on them.

The implementation has individual check-in/out buttons under room options and
one contextual action for the common case. It does not use room-selection
checkboxes or a bulk toolbar. The sketch's selection checkboxes are superseded.

### Footer and cancellation

Latest update: the user has restored `Guardar cambios` and `Cerrar` in the
quick-edit footer. Keep Save visible and disabled when there are no booking
edits. Close uses the existing unsaved-change prompt. Whole-reservation
cancellation remains available in the footer's more-actions menu. This
supersedes the earlier request below to replace Close with cancellation.

The user explicitly requested:

- Replace the footer's `Cerrar` button with `Cancelar reserva`.
- Remove `Ver historial` from the quick-edit dialog.
- Remove history from `Opciones por habitación` as well.

Cancellation is a separate deliberate action with its own confirmation and
reason. It is not a normal status transition or an alternative label for
closing the dialog. Do not cancel merely because staff dismiss the dialog.

Cancellation requires a reason and explicit confirmation, then displays the
actual server preview and resulting bill. Recorded payments remain; refunds
are handled in `Pagos`.

Use `Guardar cambios` when edits need saving. Keep check-in/out distinct from
saving amendments. The top-right close icon dismisses the dialog. Unsaved
booking, guest, and payment-form edits trigger a discard prompt before leaving.
The full page also prompts before leaving with unsaved edits.

Do not substitute a history button for checkout after a stay is complete. The
full reservation page is the place to inspect the completed record.

## Huéspedes

This tab lists the people who actually stay at the property, separately from the
main booking contact in `Detalles`.

The sketch shows a simple list with:

- Name.
- Surname.
- Booked-room assignment, displayed using its current room number.
- An add-guest action.
- Optional extra information under `Más datos`, currently document type/number,
  email, and phone.

Associate a staying guest with the reservation's booked-room record. A physical
room number can change during a move. The guest should remain associated with
the same booked stay when that happens.

Allow an unspecified room while the guest list is incomplete. The implemented
form requires name and surname for each added guest. Email, phone, identity
fields, and room assignment are optional. An assigned booked room must belong
to the reservation.

### Future online check-in

The user wants to leave room for sending an online check-in link by email or
phone in the future. This is future scope, not an instruction to build messaging
or online check-in now.

Preserve these distinctions:

- A recipient needs a usable email address or international-format mobile
  number for the chosen delivery channel.
- Each accompanying guest does not need their own email or phone merely because
  they appear in the reservation.
- The booking contact and staying guests may be different people.
- Submitting an online form is separate from actually arriving and being checked
  in by staff.
- Guest-to-booked-room relationships should support the future form.

The full online form, required identity fields, consent, link delivery, and
retention rules remain undecided. Optional fields in a sketch are not a final
data-collection policy.

## Pagos

Payment actions belong exclusively in this tab. Keep the shared reservation
summary visible so staff can relate a payment to the total and balance.

The payment form includes:

| Field | Requirement |
| --- | --- |
| Importe | Positive payment amount. Money remains integer cents internally. |
| Método | Payment method, such as cash, card, or transfer. Exact available methods depend on the application. |
| Fecha del pago | Required. Default to today and allow staff to change it. |
| Referencia | Optional. For an operation number or receipt reference. |

The user explicitly requested a required payment date and optional reference.
Show both in the payment list. An omitted reference can display `Sin referencia`.

The date staff enter represents when the payment happened. Keep its meaning
distinct from an audit timestamp showing when the record was created. The API
requires `paymentDate` for new payments, accepts an optional `reference`, and
preserves both when a financial entry is corrected. Legacy payment dates and
references are migrated from the original records.

The sketch uses `Revisar pago` before confirmation. It also includes a
transaction list and less common billing actions behind `Más opciones de
facturación`, including discounts, waivers, and refunds. Their final placement
between this tab and the full page still needs review against actual staff use.

Removing audit history from quick edit does not mean removing the payment list.
Staff still need to see recorded payments and their dates/references.

Corrections, refunds, discounts, and waivers retain the business rules in
`RESERVATION_WORKFLOW.md`. A simplified UI must not erase financial originals
or imply that a correction transfers money.

## Full reservation page

The user's latest direction is to give the quick-edit dialog the most-used UI
and have a reservation page with all the information.

The complete page should make the following information accessible:

- Reservation details, contacts, and staying guests.
- All booked rooms, dates, assignments, and individual stay states.
- Shared billing and financial records.
- Reservation and room audit history.
- Physical assignment and move history.
- Actual arrival and departure timestamps.
- Less common controls that would crowd everyday editing.

Booked dates answer what was agreed. Actual timestamps answer when arrival and
departure were recorded. Keep both in the data model even though actual
timestamps are no longer shown in quick-edit room history.

No detailed page sketch has been approved. Do not assume a particular tab set,
table layout, or navigation architecture for this page.

## Saved visual references

The latest three-tab sketch is preserved in the repository at
[artifacts/ui/reservation-quick-edit.html](artifacts/ui/reservation-quick-edit.html).
It is an HTML fragment for the conversation preview, not a portal component or
a standalone application. It contains illustrative interactions and sample
data, not production behavior.

The original conversation source was:

```text
/Users/kevinzunigacuellar/.codex/visualizations/2026/10/10/01a12440-4528-7522-aa1c-1db63decb2cc/reservation-three-tabs.html
```

Earlier sketches explored dates in individual rows, a room-focused dialog, and
other layouts. The three-tab quick-edit sketch and this document describe the
current direction. Earlier alternatives are context, not equal requirements.

Reference product: Little Hotelier Classic Front Desk reservation editor. The
user supplied a screenshot with dates above compact room rows, contact details
below, a booking summary on the right, and tabs across the top. The user's
explicit departure from that reference is to keep payment actions in `Pagos`.

Official reference pages used in the conversation:

- [Edit a reservation](https://helpcentre.littlehotelier.com/en/articles/8673701-edit-a-reservation)
- [Check guests in and out](https://helpcentre.littlehotelier.com/en/articles/8674163-change-the-status-of-a-reservation-check-in-and-check-out-guests)
- [Record a payment or refund](https://helpcentre.littlehotelier.com/en/articles/9743295-record-a-payment-or-refund-for-a-reservation)

## How to continue in a future session

1. Read this document and `RESERVATION_WORKFLOW.md` before editing the UI.
2. Inspect the working tree. The original rewrite left substantial uncommitted
   backend, database, and portal changes. Preserve unrelated work and do not
   assume the current portal is the user's approved design.
3. Use the saved sketch as a starting point for the dialog. Keep its useful
   structure while resolving the open details above.
4. When a new design decision is needed, show a small sketch and discuss that
   decision rather than redesigning the entire interface.
5. Check the actual APIs, request schemas, tests, and guest data model before
   extending the implemented guest tab or payment form.
6. Validate the common workflow first, then mixed dates/states, partial checkout,
   cancellation, and balance constraints. Keep exceptions accessible without
   making them the default presentation.
7. Update this document when the user changes a decision. Clearly separate
   agreed behavior, proposed controls, and completed implementation.

## Implemented baseline

The user's follow-up after testing the first implementation asks for a more
minimal presentation:

- Use the project's existing shadcn `DateField` for every reservation/payment
  date, including individual-room controls. Reuse existing primitives first;
  consult the shadcn skill when a needed primitive is missing.
- Show reservation status on the same row as `Editar reserva` and its code.
  Do not repeat the main contact's name in the dialog header.
- Remove repeated headings, status labels, and explanatory text from the common
  view. Keep clear, accessible field labels.
- Notes use the existing shadcn `Textarea`.
- Restore the original `BookingSummary` card, including room details and its
  original totals layout. Add waiver/refund rows only when applicable and use
  the backend's shared totals.

The user is handling browser testing for this refinement and requested code
tests only. No Playwright/browser verification was run for this refinement.

- `apps/portal/src/components/room-booking-dialog.tsx` contains quick edit and
  the shared editor. The default view has shared dates, compact room fields,
  contact and notes, with a read-only bill alongside it. The footer remains
  accessible while the dialog body scrolls.
- `apps/portal/src/components/reservation-page.tsx` opens the shared editor as
  a page. It adds `Historial` for original/current dates, actual timestamps,
  saved nightly prices, assignment changes, and before/after records. Less
  common room actions such as no-show and undoing an accidental arrival are
  available from the full page's room options.
- `apps/portal/src/lib/reservation-editor.ts` translates ordinary edits into
  workflow commands. Mixed dates remain individual; occupied-room changes
  become moves, and extensions precede moves when both are needed.
- The backend stores staying guests separately from the booking contact and
  links them to booked-room records. Mutations use the reservation's version,
  request ID, and atomic workflow command.
- Only the local database has been migrated. Staging and production deployment
  are separate work.

The full page's current layout is an implementation baseline, not an approved
detailed design. Future design work can refine it without adding history or
rare controls back into quick edit. Online check-in and message delivery remain
future scope.

Room rows use a narrow room-number selector and a trailing ellipsis menu.
The menu offers Confirmada, Check-in and Check-out as a radio group, subject
to the workflow's allowed transitions. Cancelling a room is a destructive menu
item: unsaved rooms are discarded; saved stays are cancelled and disappear
from the default view while their financial records remain available.
Individual date overrides stay under Opciones por habitación.

All editor changes remain drafts until Guardar is clicked, including room
status changes, cancellations, and financial entries. The existing reservation
summary shows the backend's preview of the combined draft. Saving commits that
same command directly, without a second billing confirmation dialog. Invalid
previews and unsettled final departures prevent saving. Closing discards drafts
through the existing unsaved-changes guard.

The edit dialog shows contact name, phone, and email directly below the title,
above the tabs. Double-clicking that line or using its pencil button expands
contact fields in place and focuses the first field. The check button collapses
the fields without saving; Guardar remains the only commit action. Contacto
principal no longer appears as a separate Details section. Notes stay editable
in Details.

Header refinement: use the compact name · reservation code header with status
on the same row. Hide contact email/phone and remove the pencil/Edit contacto
control. Double-clicking the name toggles the contact fields; keyboard users
can focus the name and press Enter or Space. Guardar still commits changes.

Latest header: omit the status badge. Double-click Nombre or Apellido to edit
only that field inline, rather than expanding a contact form. Enter or blur
ends inline editing while keeping the draft; Escape restores that field's
value from before inline editing. Guardar persists the reservation changes.

Current decision: primary contact details are read-only in the header. Inline
editing is deferred. Each room's ellipsis menu now contains Opciones avanzadas,
which expands only that room's date controls. The shared Opciones por habitación
link is removed. The same menu item collapses the room's advanced controls.

Room status now uses an Estado select alongside per-room check-in/check-out in
advanced options. The ellipsis menu retains advanced-options visibility and
cancellation only. Only valid status transitions are enabled; changes stay in
the draft and preview until Guardar.

Contacts and staying guests now use one Nombre completo field, stored and sent
as fullName. Do not split names automatically. Existing separate name parts
are joined once by migration 0012; legacy database columns remain for historical
imports. The quick-edit header remains read-only. Only the local database has
received this migration; apply it before deploying the updated API elsewhere.

Whole-booking cancellation is a destructive item inside the footer ellipsis
menu. It requires explicit confirmation, but its reason is optional. Confirming
stages the cancellation and updates the bill preview; Guardar applies it. Room
cancellation and other correction reasons retain their existing requirements.

Cancellation exception: whole-booking cancellation previews its resulting bill
in the confirmation dialog and commits immediately on Confirmar cancelación.
It does not require Guardar. The reason remains optional. Other unsaved editor
changes are discarded, and the confirmation explains this. Ordinary edits and
per-room actions keep their existing draft/save behavior.

Individual room cancellation now follows the same immediate confirmation flow
as whole-booking cancellation: preview the resulting bill, optionally enter a
reason, then Confirmar cancelación applies it directly and shows a success
toast. Guardar is not required. The confirmation explains that other unsaved
editor changes are discarded. Other per-room actions remain drafts.

Room and whole-booking cancellation confirmations use shadcn AlertDialog.
They retain the billing preview and optional reason. Buttons read Volver and
Confirmar; Confirmar commits immediately. Outside clicks do not dismiss these
alerts, and dismissal is blocked while cancellation is pending.
