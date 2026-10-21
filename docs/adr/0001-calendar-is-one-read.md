# Calendar is one read

The calendar was assembled from separate room, room type, reservation, and room closure reads, and the reservation read built a bill the grid never drew. The calendar is one read of the visible window: rooms, stays, room closures, and unassigned reserved rooms, with no bill. The client holds seven days before and after that window so a one-day step does not refetch. Refresh is focus, the calendar refresh button, or a save that changes the calendar. Assignment availability and the reservation list stay separate.

## Considered options

- Keep the four reads and only cache them. Rejected: the page would still know the leading-day rule, and the reservation read would still build a bill.
- A flexible read that also answers assignment availability and room-type counts. Rejected: the caller would have to learn too many switches.
- Hide the four reads behind a portal port. Rejected: the browser would still make the same calls.
- Refetch on every step. Rejected: a one-day step would repeat nights already held.

## Consequences

Held nights can be stale until focus, the refresh button, or a save. A jump outside the hold shows loading rather than the previous bars under the new dates.
