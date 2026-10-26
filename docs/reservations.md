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

Preview returns `{ billing, validation: { issues } }`. A priceable draft returns
200 even when operational issues block saving. Issues identify fields and room
indices in the proposed rooms, excluding removed rooms. Invalid pricing inputs
return an HTTP error. A preview never reserves inventory.

Retained nights keep saved prices. Added nights use current rates; changing room
type reprices that reserved room. Initial pricing uses a supplied flat nightly
rate, then the date's rate override, then the base rate.

## Stay dates and lifecycle

Each reservation has one `checkIn` and `checkOut` date shared by all its rooms.
These dates determine the booked nights, availability, and nightly charges.
Check-in and checkout actions change the reservation status. They do not record
separate arrival or departure timestamps or change the dates. For an early
departure, save the shorter date range together with the checkout status.

Staff may cancel a whole reservation, releasing its rooms and reducing its bill
to zero. The reservation and its payments remain recorded, with payments retained
as credit for reference. Removing an individual reserved room drops its charges
and releases its inventory while the remaining rooms keep the reservation's
status and stay dates. To release the last room, cancel the reservation.

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
  `confirmed`, `checked_in`, `checked_out`, and `cancelled` values, combined with OR.
  Omit both for unrestricted statuses; when both are sent, both restrictions apply.
- `balance=outstanding|settled|credit` selects positive, zero, or negative signed
  balances independently of status. Cancellation has a zero bill and retains
  payments as credit. The list reuses detail/workflow billing policy.
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
restoration from `cancelled` to an inventory-holding status require
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
editor reopens. The custom input keeps the caret attached to digits across edits,
including deletion beside a separator and selection replacement. Copying or cutting
a selection produces digits without visual separators. National leading zeros are
retained, not converted to a numeric value. Pasting a valid supported `+` number
selects its country and puts its national digits in the input; incomplete
international input retains its `+` prefix until it can be interpreted.
Choosing a country keeps the
national digits and revalidates them; input containing extensions or unsupported
text stays intact so country changes cannot silently discard it. Errors follow
the editor reveal rules in
[Drafts, validation, and retries](#drafts-validation-and-retries), and a blank
phone is valid with no missing-phone warning. Editors open valid, explicitly
international phones with national grouping under their recognized country, including
numbers with accepted presentation separators, not just canonical E.164 strings.
Other values appear as stored, including annotations. Until staff change the text
or country, the portal resubmits the stored value; API parsing and validation still
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

`/reservations/:id` is a read-first overview. **Contacto principal** and
**Pago y cuenta** occupy the left desktop column, with **Estadía y habitaciones**
on the right; the sections stack on phones. The header shows contact name, code,
status/date badges, and **Estado de la reserva**. The phone link appears only in
the contact card. Back opens Reservations; list-origin links retain list filters.

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
shows the room count and a divided list of room number/type and adult/child counts.
Unassigned rooms show **Sin asignar**. Occupancy editing stays in the stay editor.

The bill shows subtotal, discount including zero, total, amount paid, and signed
balance. **Editar descuento** belongs to the discount row; **Registrar pago** is
separate. Outstanding, settled, and credit balances remain distinct. This is a
reservation bill. Notes, staying-guest, payment-record, and account sections are
not exposed on the page; their existing compact-editor workflows remain available.

Selecting Confirmada, Check-in, or Check-out on an active reservation saves
immediately through the header status select. Cancellation and restoration open
consequence-aware confirmations with a current server bill and validation. The
select shows the saved status, is disabled during writes, and returns to the
previous status after failure. Retrying the same failed choice reuses its request
ID. It is independent of the stay editor.

### Compact calendar dialog

The compact dialog keeps **Detalles / Huéspedes / Pagos**, a contact/status header,
and footer controls. Its header shows contact name, saved status, phone, and code,
without contact email. On mobile, **Ver reserva completa** moves into
**Más acciones de reserva**. The full-screen form body scrolls while header and
footer remain reachable; closing preserves the calendar and its scroll position.

The mobile footer has one bill accordion, with the colored balance bar at the
bottom and the full breakdown expanding upward above it. The breakdown includes
room charges, the editable discount, total, and amount paid; there is no separate
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
success. Dismissed or failed cancellation preserves it. Pending writes, including
discount autosaves, block overlapping writes.

### Drafts, validation, and retries

Editors capture opening values so background reads cannot replace a draft. Failed
saves retain drafts; dirty dismissal asks for confirmation, and router navigation
and browser unload are guarded while dirty or saving. Successful commands refresh
reservation, calendar, and inventory queries. Lifecycle writes show pending,
success, and failure feedback, block duplicates, and reuse request IDs for retries
of unchanged actions after uncertain responses. Check-in/checkout do not change
stay dates or require payment or physical assignment.

Room-type menus account for other reservations, closures, and other draft rooms.
The current choice remains visible, and changes wait for current availability.
Server previews still validate before saving. Validation runs on blur and submit,
then on change after a submission attempt. Room count and capacity validate on
change because they control previews. Known server errors appear beside fields;
other write errors use toasts. Query errors stay beside the content they block.

Portal forms use TanStack Form and local Zod schemas in
[reservation-form-schemas.ts](../apps/portal/src/lib/reservation-form-schemas.ts).
Details, staying guests, payments, discount, and cancellation have independent
forms; writes use TanStack Query and workflow commands. The shared
[use-stay-draft.ts](../apps/portal/src/lib/use-stay-draft.ts) owns stay draft values,
validation feedback, preview timing, reusable prices, and reset for the compact
and page stay editors. It also retains compact-editor notes. Write guards and
independent workflows remain with their editors.

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
