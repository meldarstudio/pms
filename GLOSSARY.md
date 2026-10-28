# Property management

The shared language for managing room reservations, staying guests, availability, rates, and
reservation bills at the property.

## Language

### Property

**Property**:
The hotel whose rooms, rates, and reservations are managed together.
_Avoid_: Tenant, hotel account

**Property timezone**:
The local timezone of the property, which determines its calendar date regardless of where staff are
working.
_Avoid_: Staff timezone, browser timezone

**Property date**:
The current calendar date at the property, used when referring to today in property operations.
_Avoid_: Staff's local date, UTC today

### Access

**Staff account**:
The shared login that the people who operate the portal use day to day, with the staff role. Changes
made under it are not attributed to individual people.
_Avoid_: User, manager login

**Owner account**:
The property owner's personal login, with the owner role.
_Avoid_: Admin account, superuser

**Role**:
The level of access an account holds, either staff or owner. The owner role can do everything the staff
role can, and also manage accounts.
_Avoid_: Permission level, admin

### Reservations and dates

**Reservation**:
A booking of one or more rooms with one booking contact, one status, and shared check-in and checkout
dates.
_Avoid_: Booking

**Reserved room**:
One room included in a reservation, with a room type, declared occupancy, nightly prices, and an
optional physical room assignment.
_Avoid_: Room line, physical room

**Room removal**:
The withdrawal of one reserved room from a reservation, removing its room charges and releasing its
room inventory. The remaining reserved rooms keep the reservation's status and stay dates.
_Avoid_: Reservation cancellation

**Booking contact**:
The primary contact for a reservation, who may be different from the people staying at the property.
_Avoid_: Guest when only the contact is meant, payer

**Staying guest**:
A named person staying under a reservation, optionally associated with one of its reserved rooms.
_Avoid_: Booking contact, occupant count

**Contact phone**:
A phone number provided to reach a booking contact or staying guest, which may be shared with other
people. It does not establish the person's identity or ownership of the number.
_Avoid_: Verified phone when only its format has been checked

**Guest list**:
The optional list of named staying guests for a reservation, which may remain empty or incomplete even
after check-in.
_Avoid_: Occupancy, booking contact

**Reservation notes**:
Staff remarks about one reservation, kept with that reservation only.
_Avoid_: Contact notes, guest notes

**Contact notes**:
Staff remarks about a booking contact as a person, carried across every reservation they make.
_Avoid_: Reservation notes

**Reservation code**:
The reference used to identify a reservation when communicating about it.
_Avoid_: Room number

**Stay dates**:
The calendar check-in and checkout dates at the property, shared by every room in a reservation and
unchanged by the viewer's timezone.
_Avoid_: Arrival timestamp, departure timestamp

**Stay draft**:
Proposed changes to a reservation's stay dates, reserved rooms, room assignments, and occupancy that
have not yet been saved. The saved reservation remains unchanged until those changes are accepted.
_Avoid_: Saved reservation, preview reservation

**Stay night**:
One night beginning on a date within the stay, including the check-in date and excluding the checkout
date.

**Check-in date**:
The first date of the reserved stay, whose night is included in the reservation.

**Checkout date**:
The end date of the reserved stay, whose night is excluded from the reservation and available for a new
arrival.

**Check-in**:
The acknowledgement that a reservation's stay has begun, represented by the checked-in status.
_Avoid_: Check-in date when referring to the action

**Checkout**:
The acknowledgement that a reservation's stay has ended, represented by the checked-out status.
_Avoid_: Checkout date when referring to the action

**Confirmed**:
A reservation status for an accepted reservation that holds room inventory for its stay dates.
_Avoid_: Paid, assigned

**Checked in**:
A reservation status indicating that the stay has begun, with room inventory held for the stay dates.
_Avoid_: Assigned, paid

**Checked out**:
A reservation status indicating that the stay has ended, with its final stay dates retained as booked
nights in room inventory.
_Avoid_: Paid, cancelled

**Cancellation**:
The withdrawal of a reservation at the request of the person who reserved or by a staff decision,
releasing its room inventory. The reservation and its payment history remain on record.
_Avoid_: Deletion, refund

**No-show**:
A reservation outcome recorded by staff when they determine that the expected guest will not arrive,
releasing its room inventory while retaining the reservation and its financial history.
_Avoid_: Guest-requested cancellation, automatic checkout

**Restoration**:
The return of a cancelled or no-show reservation to confirmed, checked in, or checked out.
_Avoid_: Status correction, undelete, check-in

**Unfulfilled**:
A reservation status for an online reservation whose payment succeeded after its room type was no
longer available. It holds no room inventory and keeps its payment until staff settle the refund due.
_Avoid_: Cancelled, held, expired

### Rooms and availability

**Room**:
A physical accommodation unit at the property, identified by a room number and belonging to one room
type.
_Avoid_: Reservation, room type

**Room type**:
A category of rooms with shared adult and child limits and a base rate.
_Avoid_: Room number

**Room-type draft**:
Proposed changes to one room type's name, occupancy limits, base rate, and room numbers, including new
rooms, that have not yet been saved. The saved room type and rooms remain unchanged until accepted.
_Avoid_: Saved room type, inventory draft

**Room assignment**:
The selection of a specific physical room for a reserved room over the reservation's stay dates.
_Avoid_: Guest room allocation when referring to the physical room selection

**Room closure**:
A dated period when a physical room is unavailable for stays, including the start date's night and
excluding the end date's night.
_Avoid_: Room status, maintenance status

**Housekeeping status**:
Whether a physical room is ready for its next guest, either dirty or clean, as last marked by staff. It
is independent of room closures and of whether the room is occupied.
_Avoid_: Room status, cleaning state, occupancy

**Dirty**:
A housekeeping status for a room that must be cleaned before a guest is given it.
_Avoid_: Occupied, closed

**Clean**:
A housekeeping status for a room that is ready to be given to a guest.
_Avoid_: Vacant, available

**Room inventory**:
The supply of physical rooms in each room type, measured in rooms rather than people.
_Avoid_: Guest capacity

**Room-type availability**:
The number of additional rooms of a type that can be reserved for the requested nights after accounting
for existing reservations and room closures, limited by the night with the fewest rooms remaining.
_Avoid_: Vacant rooms, unassigned rooms

**Assignment availability**:
Whether a specific physical room matches the reserved room's type and is free of conflicting
reservations and closures for the entire stay.
_Avoid_: Room-type availability

**Calendar**:
The staff view of each room over a span of property dates, showing that room's stays and room
closures, together with the assignment backlog. A stay or room closure
that ends on the first morning of the span is still shown on that room.
_Avoid_: Room-type availability, inventory

**Assignment backlog**:
The unassigned reserved rooms in confirmed or checked-in reservations whose stays overlap the displayed
nights. Reservations that are checked out, cancelled, or departing on the first displayed morning are excluded.
_Avoid_: Room inventory, all unassigned reservations

**Property setup**:
The room types and rooms that must exist before a reservation can be taken.
_Avoid_: Inventory, admin

**Occupancy**:
The declared number of adults and children for a reserved room, independent of how many staying guests
appear in the guest list.
_Avoid_: Booked room count, registered guest count

**Maximum adults**:
The greatest number of adults permitted in one room of a room type, counted separately from children.
_Avoid_: Recommended occupancy, combined maximum occupancy

**Maximum children**:
The greatest number of children permitted in one room of a room type, counted separately from adults.
_Avoid_: Child price allowance, combined maximum occupancy

### Rates and charges

**Rate plan**:
A reservation offer combining a price adjustment, a cancellation policy, and a payment schedule.
_Avoid_: Room type, price rule, cancellation policy when referring to the whole offer

**Price adjustment**:
A rate plan's percentage change to the ordinary nightly prices of a reservation that accepts it.
_Avoid_: Discount, rate override, price rule

**Cancellation policy**:
The agreed conditions that determine a reservation's charge when it is cancelled or the guest does
not arrive.
_Avoid_: Refund, payment schedule

**Payment schedule**:
The agreed amounts payable toward a reservation and when they are due.
_Avoid_: Payment method, cancellation policy

**Deposit**:
An advance payment toward a reservation's total, whose required amount follows its payment schedule.
_Avoid_: Additional charge, automatically refundable payment

**Required initial payment**:
The first amount a reservation's payment schedule requires: a deposit, or the whole total when the
schedule requires full payment upfront.
_Avoid_: Amount paid, balance

**Remaining scheduled amount**:
The part of a reservation's total that its payment schedule leaves after the required initial payment,
regardless of payments received.
_Avoid_: Balance, amount owed

**Base rate**:
A room type's default price for one room for one night.
_Avoid_: Total price, per-person rate

**Rate override**:
A room type's price for a particular night that replaces its base rate for that night.
_Avoid_: Discount, reservation-specific rate

**Flat nightly rate**:
A reservation-specific price applied equally to every initial night of a newly reserved room in place
of the room type's rates.
_Avoid_: Rate override, total stay price

**Saved nightly price**:
The price agreed for a particular reserved room and stay night, retained when that night and room type
remain in the reservation.
_Avoid_: Current rate

**Room charge**:
The amount billed for a reserved room's stay nights, calculated from its saved nightly prices.
_Avoid_: Payment

**Cancellation charge**:
The amount owed under a reservation's agreed policy when it is cancelled or recorded as a no-show,
before any staff waiver.
_Avoid_: Deposit received, refund

**Charge waiver**:
A reasoned staff decision to reduce or remove a cancellation charge.
_Avoid_: Refund, received payment, reservation discount

### Reservation bill

**Reservation bill**:
The account of a reservation's room charges, discount, received payments, and resulting balance.
_Avoid_: Invoice, payment receipt

**Subtotal**:
The sum of the reservation's billable room charges before its discount.
_Avoid_: Total, amount paid

**Discount**:
A fixed monetary reduction applied to the reservation's subtotal, limited to that subtotal so the
discount alone cannot create credit.
_Avoid_: Payment, refund, rate override

**Total**:
The reservation's subtotal less its applied discount, before deducting payments.
_Avoid_: Balance, amount paid

**Payment**:
An amount of money received toward a reservation's bill, with a payment method and payment date.
_Avoid_: Discount, room charge

**Payment method**:
The way money was received for a payment, such as cash, card, bank transfer, Yape, or Plin.
_Avoid_: Payment reference, payment processing

**Payment date**:
The calendar date at the property on which a payment was received, unchanged by the viewer's timezone.
_Avoid_: Date entered

**Quote**:
The prices, rate plan, and amount to pay offered to an online guest, valid for 10 minutes. A quote
does not hold room inventory.
_Avoid_: Hold, preview, reservation

**Payment attempt**:
One request to charge an online guest for a quote, recorded before the payment provider is called.
An attempt whose result is unknown is resolved by looking up the provider, never by charging again.
_Avoid_: Payment, charge, retry

**Refund**:
Money returned against a payment previously received for a reservation.
_Avoid_: Cancellation, charge waiver, future-stay coupon

**Refund due**:
Money still owed back to the guest after accounting for final charges, completed refunds, and any
agreed conversion to a future-stay coupon. A pending or failed refund attempt does not settle this
obligation.
_Avoid_: Completed refund, redeemable coupon

**Amount paid**:
The sum of the payments recorded against a reservation.
_Avoid_: Revenue, total

**Balance**:
The reservation's total less its amount paid, with a positive balance indicating money owed and a
negative balance indicating credit.
_Avoid_: Total, unpaid charges without accounting for payments

**Credit**:
The amount by which a reservation's payments exceed its total, represented by the magnitude of a
negative balance. Credit remains on the reservation for reference, including after cancellation, and
does not imply a refund or a redeemable coupon.
_Avoid_: Refund, coupon

**Future-stay coupon**:
A transferable fixed monetary value, represented by a code, issued for redemption toward a later
reservation at the property.
_Avoid_: Promotional discount, reservation credit, refund

**Coupon redemption**:
The application of a future-stay coupon's value toward a reservation, reducing its remaining coupon
balance and the amount owed for that reservation without receiving new money.
_Avoid_: Cash payment, promotional discount, refund

**Outstanding balance**:
The amount a reservation still owes, represented by a positive balance.
_Avoid_: Debt, unpaid charges without accounting for payments

**Settled**:
The state of a reservation whose balance is zero, with nothing owed and no credit held.
_Avoid_: Paid, closed
