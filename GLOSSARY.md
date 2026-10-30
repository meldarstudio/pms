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

**Staying guest**:
A named person staying under a reservation, optionally linked to a reserved room.
_Avoid_: Booking contact, occupant count

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

**No-show**:
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

**Flat nightly rate**:
A reservation-specific price replacing ordinary rates on every initial night of a
newly reserved room.
_Avoid_: Rate override, total stay price

**Saved nightly price**:
The agreed price retained for a reserved room/night while that night and type remain.
_Avoid_: Current rate

**Room charge**:
The amount billed from a reserved room's saved nightly prices.
_Avoid_: Payment

**Cancellation charge**:
The policy amount owed on cancellation or no-show, before staff waivers.
_Avoid_: Deposit received, refund

**Charge waiver**:
A reasoned staff reduction of a cancellation charge.
_Avoid_: Refund, reservation discount

### Reservation bill

**Reservation bill**:
Room charges, discount, received payments, refunds, coupon movements, and resulting
balance. Cancellation replaces room charges and discount with the final cancellation
charge.
_Avoid_: Invoice, payment receipt

**Subtotal / total**:
Room charges before discount / after the capped discount, before payments or coupon
settlement. A cancelled reservation's total is its cancellation charge after waivers.
_Avoid_: Balance, amount paid

**Discount**:
A fixed reduction capped at subtotal; it cannot alone create credit.
_Avoid_: Payment, refund, rate override

**Payment**:
Money received toward the bill, with a method and property-calendar payment date.
_Avoid_: Discount, room charge

**Quote**:
An online price, rate plan, and amount-to-pay offer valid for 10 minutes, without
holding inventory.
_Avoid_: Hold, preview, reservation

**Payment attempt**:
A request to charge for a quote, recorded before contacting the provider. An unknown
result is resolved by provider lookup, not another charge.
_Avoid_: Payment, retry

**Refund**:
Money returned against a received payment. Only a completed refund has returned money;
a requested or failed refund has not.
_Avoid_: Cancellation, charge waiver, future-stay coupon

**Refund due**:
Money still owed back after charges, completed refunds, and agreed future-stay coupon
conversion; a pending/failed refund does not settle it.
_Avoid_: Completed refund, redeemable coupon

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
