# Property management

The shared language for managing room reservations, staying guests, availability, rates, and
reservation bills at the property.

## Language

### Access

**Staff account**:
The single shared login that everyone who operates the portal uses, identified by one fixed username.
Changes made under it are not attributed to individual people.
_Avoid_: Admin account, user, manager login

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

**Guest list**:
The optional list of named staying guests for a reservation, which may remain empty or incomplete even
after check-in.
_Avoid_: Occupancy, booking contact

**Reservation code**:
The reference used to identify a reservation when communicating about it.
_Avoid_: Room number

**Stay dates**:
The check-in and checkout dates shared by every room in a reservation.
_Avoid_: Arrival timestamp, departure timestamp

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
releasing its room inventory and reducing its bill to zero. The reservation and its payments remain on
record, with payments retained as credit for reference.
_Avoid_: Deletion, refund

### Rooms and availability

**Room**:
A physical accommodation unit at the property, identified by a room number and belonging to one room
type.
_Avoid_: Reservation, room type

**Room type**:
A category of rooms with a shared maximum occupancy and base rate.
_Avoid_: Room number

**Room assignment**:
The selection of a specific physical room for a reserved room over the reservation's stay dates.
_Avoid_: Guest room allocation when referring to the physical room selection

**Room closure**:
A dated period when a physical room is unavailable for stays, including the start date's night and
excluding the end date's night.
_Avoid_: Room status, maintenance status

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

**Occupancy**:
The declared number of adults and children for a reserved room, independent of how many staying guests
appear in the guest list.
_Avoid_: Booked room count, registered guest count

**Maximum occupancy**:
The greatest combined number of adults and children permitted in one room of a room type.
_Avoid_: Room inventory, room capacity without specifying people

### Rates and charges

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

**Payment date**:
The calendar date on which a payment was received.
_Avoid_: Date entered

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

**Outstanding balance**:
The amount a reservation still owes, represented by a positive balance.
_Avoid_: Debt, unpaid charges without accounting for payments

**Settled**:
The state of a reservation whose balance is zero, with nothing owed and no credit held.
_Avoid_: Paid, closed
