# Property management

Shared language for room reservations, availability, rates, and reservation bills.

## Language

### Property

**Property**:
The hotel whose rooms, rates, and reservations are managed together.
_Avoid_: Tenant, hotel account

**Property timezone**:
The property's local timezone, independent of where staff work.

**Property date**:
Today's calendar date at the property, not the browser's or UTC date.

### Access

**Staff account**:
The shared day-to-day login with the staff role; it does not identify an individual.

**Owner account**:
The owner's personal login, allowed to do everything staff can and manage accounts.
_Avoid_: Admin account, superuser

**Reservation access link**:
The unguessable read-only link established once for a saved public reservation.
It expires 30 days after the scheduled checkout and shows that reservation's
guest-facing status and payment summary to whoever holds it.
_Avoid_: Reservation code, guest account, payment link, checkout token

### Published guest information

**Privacy information / Información de privacidad**:
The property's public disclosure of how it handles guests' and complainants' personal
data; it is read, never accepted.
_Avoid_: Privacy policy consent, privacy terms

**Reservation conditions / Condiciones de reserva**:
The property's published general rules for booking, changes, cancellation and refunds;
each reservation's agreed terms remain those of its accepted quote.
_Avoid_: Terms and conditions, cancellation policy, booking policy

### Reservations and dates

**Reservation**:
A booking of one or more rooms with one booking contact, status, and shared stay dates.
_Avoid_: Booking

**Reserved room**:
One room in a reservation, with a room type, declared occupancy, nightly prices, and
an optional physical room assignment.
_Avoid_: Room line, physical room

**Room removal**:
Withdrawal of one reserved room and its charges/inventory, leaving the remaining
rooms' reservation status and dates unchanged.
_Avoid_: Reservation cancellation

**Booking contact**:
The reservation's primary contact, who need not be staying at the property.
_Avoid_: Guest when only the contact is meant, payer

**Nationality**:
A booking contact's country of citizenship, independent of where they live or their
contact phone's country.
_Avoid_: Origin, country of residence

**Staying guest**:
A named person staying under a reservation.
_Avoid_: Booking contact, occupant count

**Identity document**:
The document type and number identifying a staying guest: DNI, carné de extranjería,
passport, or another document.
_Avoid_: ID

**Contact phone**:
A contact number, possibly shared; its format does not establish identity,
ownership, reachability, or WhatsApp support.
_Avoid_: Verified phone

**Guest list**:
The optional named staying guests, which may be incomplete even after check-in.
_Avoid_: Occupancy

**Reservation notes**:
Staff remarks kept with one reservation only.

**Contact notes**:
Staff remarks about a booking contact, carried across their reservations.

**Stay dates**:
Calendar check-in and checkout dates shared by every reserved room, independent of
the viewer's timezone. A stay night includes check-in and excludes checkout.
_Avoid_: Arrival/departure timestamps

**Stay draft**:
Unsaved proposed stay dates, reserved rooms, assignments, and occupancy.
_Avoid_: Saved reservation, preview reservation

**Check-in / checkout**:
Acknowledgement that a stay has begun/ended, distinct from its booked dates.

**Confirmed**:
An accepted reservation holding room inventory for its stay dates.
_Avoid_: Paid, assigned

**Checked in**:
A begun stay holding room inventory for its stay dates.
_Avoid_: Assigned, paid

**Checked out**:
An ended stay whose final stay dates remain booked nights in room inventory.
_Avoid_: Paid, cancelled

**Cancellation**:
Withdrawal of a reservation by its booker or staff, releasing inventory but keeping
the reservation and payment history.
_Avoid_: Deletion, refund

**No-show / No se presentó**:
Staff's determination that an expected guest will not arrive, releasing inventory
while keeping the reservation and financial history.
_Avoid_: Guest-requested cancellation, automatic checkout

**Restoration**:
Returning a cancelled or no-show reservation to confirmed, checked in, or checked out.
_Avoid_: Undelete, check-in

**Unfulfilled**:
An online reservation paid after its room type became unavailable, holding no
inventory while its payment remains refund due.
_Avoid_: Cancelled, held, expired

### Rooms and availability

**Room**:
A physical accommodation unit with a room number and room type.
_Avoid_: Reserved room

**Room type**:
A category with shared adult/child limits and a base rate.

**Published room type**:
A room type explicitly listed by stable ID for online offers; names never publish a type,
and new types stay unpublished until listed.
_Avoid_: Online room, public room

**Offer**:
A published room type's price and terms under one rate plan for searched dates and
guests, shown before a quote is created.
_Avoid_: Quote, availability

**Room-type draft**:
Unsaved proposed name, occupancy limits, base rate, and room numbers/additions for a type.

**Room assignment**:
Selection of a physical room for a reserved room over the stay dates.

**Room closure**:
A period when a physical room is unavailable, including the start night's date and
excluding the end date.
_Avoid_: Room status, maintenance status

**Housekeeping status**:
Dirty or clean as last marked by staff, independent of occupancy and closures.
_Avoid_: Room status, occupancy

**Dirty / clean**:
Needs cleaning before the next guest / ready for the next guest.
_Avoid_: Occupied/vacant, closed/available

**To-clean list**:
Dirty rooms to clean today: no guest staying tonight, and not closed unless a guest arrives
today.
_Avoid_: Cleaning schedule, room status

**Room inventory**:
The physical room supply per type, measured in rooms, not people.
_Avoid_: Guest capacity

**Room-type availability**:
Additional rooms reservable after reservations and closures, limited by the requested
night with the fewest rooms remaining.
_Avoid_: Vacant rooms, unassigned rooms

**Assignment availability**:
Whether one physical room matches the type and has no conflicting stays or closures
for the entire stay.
_Avoid_: Room-type availability

**Calendar**:
The staff view of rooms, stays, closures, and the assignment backlog across property dates.
_Avoid_: Room inventory

**Assignment backlog**:
Unassigned rooms in confirmed/checked-in reservations overlapping displayed nights,
excluding departures on the first displayed morning.
_Avoid_: All unassigned reservations

**Property setup**:
The room types and rooms needed before taking reservations.

**Occupancy**:
Declared adults and children per reserved room, independent of named staying guests.
Maximum adults and maximum children are separate hard limits, not a combined count.
_Avoid_: Registered guest count, booked room count

### Rates and charges

**Rate plan**:
An offer combining a price adjustment, cancellation policy, and payment schedule.
_Avoid_: Room type, price rule

**Ordinary nightly price**:
A room type's price for a date: its rate override, otherwise its base rate.
_Avoid_: Saved nightly price

**Flexible**:
The default rate plan, charging the ordinary nightly price without adjustment.

**Derived rate plan**:
A rate plan whose nightly prices follow the ordinary nightly price through a price
adjustment, such as Non-refundable, and are never set independently.
_Avoid_: Independent rate, rate override

**Price adjustment**:
A rate plan's percentage change to ordinary nightly prices.
_Avoid_: Discount, rate override

**Cancellation policy**:
Agreed conditions determining the charge for cancellation or no-show.
_Avoid_: Refund, payment schedule

**Payment schedule**:
Agreed amounts payable and when due, independent of money already received.
_Avoid_: Payment method, cancellation policy

**Deposit**:
An advance payment toward the total, required according to the payment schedule.
_Avoid_: Additional charge, automatically refundable payment

**Required initial payment**:
The first scheduled amount: a deposit or the full total upfront.
_Avoid_: Amount paid, balance

**Remaining scheduled amount**:
Total left after the required initial payment, regardless of payments received.
_Avoid_: Balance, amount owed

**Base rate / rate override**:
A type's default room-night price / a date-specific replacement for that price.
_Avoid_: Per-person price, reservation-specific rate

**Saved nightly price**:
The agreed price retained for a reserved room/night while that night and type remain.
_Avoid_: Current rate

**Room charge**:
The amount billed from a reserved room's saved nightly prices.
_Avoid_: Payment

**Extra**:
A described fixed amount on a reservation bill for something agreed beyond the room
nights, such as a late checkout; it is not a nightly price.
_Avoid_: Additional charge, negative discount, rate override, surcharge

**Custom extra / Extra personalizado**:
An extra whose description and amount staff write for one reservation.
_Avoid_: Side deal, manual charge

**Cancellation charge**:
The policy amount owed on cancellation or no-show, before staff waivers.
_Avoid_: Deposit received, refund

**Charge waiver / Cargo perdonado**:
A reasoned staff reduction of a cancellation charge.
_Avoid_: Refund, reservation discount

### Reservation bill

**Reservation bill**:
Room charges, extras, discount, received payments, refunds, coupon movements, and
resulting balance. Cancellation replaces room charges, extras, and discount with the final
cancellation charge.
_Avoid_: Invoice, payment receipt

**Subtotal / total**:
Room charges and extras before discount / after the capped discount, before payments
or coupon settlement. A cancelled reservation's total is its cancellation charge after waivers.
_Avoid_: Balance, amount paid

**Discount**:
A fixed reduction capped at subtotal; it cannot alone create credit.
_Avoid_: Payment, refund, rate override

**Payment**:
Money received toward the bill, with a method and property-calendar payment date.
_Avoid_: Discount, room charge

**Voided payment / Pago anulado**:
A payment marked as recorded by mistake, kept visible with its reason but no longer
counted in the bill or amount paid. Voiding returns no money and cannot be undone.
_Avoid_: Refund, deleted payment, payment correction

**Quote**:
An online price, rate plan, and amount-to-pay offer valid for 10 minutes, without
holding inventory.
_Avoid_: Hold, preview, reservation

**Public checkout**:
A guest's private online review of one selected stay, room type, occupancy, and rate plan,
reachable only with its secret token. It holds that selection's quotes and agreement
acceptances.
_Avoid_: Cart, session, reservation

**Abandoned public checkout**:
A public checkout with no reservation and no payment attempt other than failed ones, whose
latest activity (opening, quotes, acceptances, payment attempts) was over 30 days ago. It
is deleted with its quotes, acceptances and failed attempts.
_Avoid_: Expired checkout, cart abandonment

**Agreement acceptance**:
A booking contact's acceptance of one quote's terms within a public checkout, recorded
before any payment. A new acceptance is explicit and only of the checkout's latest
unexpired quote. Refreshing a quote keeps that acceptance only when the replacement has
the same room, stay, occupancy, nightly prices and terms.
_Avoid_: Payment, confirmation, reservation

**Public payment admission / Pagos en línea**:
The owner's server-enforced switch for new public card payments, off by default. The owner
pauses it in Configuración for provider maintenance or outages. Pausing it
stops new charges even in open public checkouts, but not status reads, staff work, recovery
of earlier payment attempts, or completing bank authentication already waiting on an attempt.
_Avoid_: Maintenance mode, closing sales

**Payment attempt**:
A request to charge a public checkout's accepted quote, recorded before contacting the
provider. Its contact is that checkout acceptance's. An unknown result is resolved by
provider lookup, not another charge. Bank authentication continues that same attempt and
source, even after the quote expires; a bank refusing it, or 24 hours without finishing it,
fails the attempt so another card can pay.
_Avoid_: Payment, retry

**Confirmation email**:
One queued message about a public reservation: the automatic confirmation, queued in the
same save as a Confirmed reservation, or a resend that staff request for an explicit
recipient. It is pending until a scheduled run with the email provider configured sends it,
then sent or failed; public payment admission does not hold it. A transient
provider error retries with the same idempotency key a few times before it fails; a refused
message fails at once. Content is rendered at the first send and reused by its retries. A resend summarizes the reservation's
current status, agreement and bill; it is not a new confirmation and does not extend access.
Sent means the provider accepted it, not that it was delivered or read.
_Avoid_: Delivery, notification, receipt

**Refund**:
Money returned against a received payment. Only a completed refund has returned money;
a requested or failed refund has not.
_Avoid_: Cancellation, charge waiver, future-stay coupon

**Refund due / Por devolver**:
Money still owed back after charges, completed refunds, and agreed future-stay coupon
conversion; a pending/failed refund does not settle it.
_Avoid_: Completed refund, redeemable coupon

**Unresolved bill / Por resolver**:
A reservation bill with refund due, or with an outstanding balance after the stay
ended (checked out, cancelled, or no-show).
_Avoid_: Attention list, open balance

**Outstanding balance / Saldo pendiente**:
The amount still owed toward a reservation bill after payments and coupon settlement.
_Avoid_: Total, required initial payment

**Amount paid / net retained**:
Gross received payments / those payments less completed refunds. Coupon issuance and
redemption do not change either.
_Avoid_: Revenue

**Balance**:
Total less applied coupon value and net retained, plus value converted into issued
coupons: positive is outstanding, negative is credit, zero is settled.
_Avoid_: Total, amount paid

**Credit**:
What is still owed back after final charges, completed refunds, coupon settlement,
and agreed coupon conversion: refund due on any reservation, not necessarily a refund
request or redeemable coupon.
_Avoid_: Refund, coupon

**Future-stay coupon**:
Transferable fixed monetary value represented by a code for a later reservation.
_Avoid_: Promotional discount, reservation credit, refund

**Coupon redemption**:
Applying coupon value toward a reservation, reducing coupon balance and the amount
owed without receiving new money.
_Avoid_: Cash payment, promotional discount, refund

**Coupon settlement / Pagado con cupón**:
Coupon value currently applied toward a reservation bill, excluding value returned
to the coupon.
_Avoid_: Money received, discount

**Coupon conversion / Pasado a cupón**:
Refund due converted into future-stay coupon value with the guest's agreement instead
of returning money.
_Avoid_: Completed refund, coupon redemption

### Complaint book

**Complaint book / Libro de Reclamaciones**:
The property's legally required register of guests' reclamos and quejas, kept as
consecutively numbered complaint sheets.
_Avoid_: Complaints inbox, ticket system

**Complaint sheet / Hoja de reclamación**:
One numbered entry in the complaint book, a reclamo or a queja, kept with the disclosures
it was filed under. It is never edited or deleted.
_Avoid_: Complaint alone, ticket, case

**Physical backup sheet / Respaldo físico**:
A complaint sheet filed on paper while the virtual book could not be used, transcribed
afterwards by the owner with its original reference and filing time, and numbered in the
same book.
_Avoid_: Import, manual complaint

**Response deadline**:
The property date by which a sheet must be answered: 15 weekdays after its filing date.
Holidays count as weekdays, so it is never later than the legal deadline.

**Complaint response**:
The owner's record of an answer already sent to the complainant: its text, channel,
recipient and sending date. Recording it sends nothing.
_Avoid_: Reply, message

**Voided response**:
A response marked as recorded by mistake, kept visible with its reason. It no longer
answers the sheet and cannot be changed or undone.

**Answered / overdue**:
A sheet is answered while it has a response that is not voided, and overdue when it is
unanswered after its response deadline.

**Complaint receipt**:
The complainant's copy of their filed sheet, shown privately after filing and emailed when
they gave an address.

**Receipt copy**:
A further email of the same receipt, requested by the owner after the receipt email failed.
