# Online same-day arrivals close at 11:00 p.m. property time

Guests can reserve online for arrival on the property date (America/Lima) until 11:00 p.m. property time, replacing the earlier tomorrow-onward rule (#263, built in #320). The close is not check-in time or reception closing; it exists so that a 10-minute quote started for today cannot still be valid after midnight, when that check-in becomes past. A new offer, quote, checkout or quote refresh for today is refused from 11:00 p.m.; a charge on an unexpired quote started before the close is still accepted, and a payment that completes after midnight leaves the reservation Unfulfilled rather than adding a new outcome. Staff reservations keep their own dates, including today and past dates after the close.

## Consequences

- The close hour is fixed in code, not a setting, in `packages/shared/src/online-arrival.ts`, which both the backend and the website use. The guest and portal messages that name 11:00 p.m. are copy and change by hand.
- Same-day guests compete for the last room with walk-ins under the ordinary inventory rules; nothing holds rooms back.
