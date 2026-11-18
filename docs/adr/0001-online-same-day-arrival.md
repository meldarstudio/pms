# Online same-day arrivals close at 11:00 p.m. property time

Guests can reserve online for arrival on the property date (America/Lima) until 11:00 p.m. property time, replacing the earlier tomorrow-onward rule (#263, built in #320). The close is not check-in time or reception closing; it exists so that a 10-minute quote started for today cannot still be valid after midnight, when that check-in becomes past. A new offer, quote, checkout or quote refresh for today is refused from 11:00 p.m.; a charge on an unexpired quote started before the close is still accepted, and a payment that completes after midnight leaves the reservation Unfulfilled rather than adding a new outcome. Staff reservations keep their own dates, including today and past dates after the close.

## Consequences

- The close hour is fixed in code, not a setting, and is defined in both the backend (`apps/backend/src/property-calendar.ts`) and the website (`apps/website/src/lib/reservation/search.ts`); the two must change together.
- Same-day guests compete for the last room with walk-ins under the ordinary inventory rules; nothing holds rooms back.
