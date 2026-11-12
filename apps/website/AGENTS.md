# Website

Static Astro site for Hotel Manantial in Churín, Peru. Cloudflare serves `dist/`.
Reservation search is always visible. `PUBLIC_PMS_API_URL` overrides the API URL;
development defaults to the local backend and builds to the production API.
Choose is the rooms page (`/habitaciones/`): one React island
(`src/components/rooms/RoomsBooking.tsx`) with the dates-and-guests form and every
room, prerendered for search engines. It refreshes live offers from the PMS `/public`
API in place, never in the HTML. A searched stay lists each room at its lowest total;
choosing a room replaces that list with the room's rate plans, lowest selected, and one
Book link to Review. The last
search is kept in `sessionStorage` (`src/lib/reservation/draft.ts`) so the homepage
and Choose prefill it; dates before the first online arrival are dropped. Review (`/reservar/revisar/`) opens a private checkout, shows
its server Quote, and records the booking contact's acceptance. Pay refreshes an
expired quote and keeps that acceptance only when the guest is paying; an unchanged
offer is charged, and a changed offer, including a lower price, is shown for a new
acceptance and is not charged. Accepting an expired quote also refreshes, then records
the contact and language just submitted. The checkout token
lives only in `sessionStorage` (`src/lib/reservation/draft.ts`), never in URLs.
The private summary (`/reservar/resumen/`) reads `GET /public/reservation` with the
access token from the URL fragment only, sent as `Authorization: Bearer` with
`referrerPolicy: "no-referrer"`. When a payment confirms the reservation, Review
replaces itself with that link (`location.replace`) and stores the reservation code
in `sessionStorage`; the summary greets the stay as just confirmed only while that
code matches a confirmed reservation, so a reopened or shared link shows the plain
summary. Other saved outcomes stay on Review and offer to copy the link. The summary
is not a wizard step and marketing pages do not link to it.
`src/lib/rooms.ts` links each room to a PMS room-type ID; the API offers only types
it publishes. Card payment on Review needs build-time `PUBLIC_CULQI_PUBLIC_KEY` and
`PUBLIC_TURNSTILE_SITE_KEY`; without either, Review says payment isn't available. Payment
status is read back from the checkout (`src/lib/reservation/payment.ts`), so reload, back
and language changes show the existing attempt instead of paying again. Before the first
charge, Review loads Culqi3DS and sends `generateDevice()` when it succeeds; a failure to
load does not block a non-3DS card. A required bank check opens that library's modal with
the card token stored for the attempt this request created (`hm.reservation.card-sources`),
never the URL, and only while that attempt id still matches. The token stays until the
payment is declined, confirmed, unfulfilled, changed, or saved.
Parameters continue the same attempt; a browser error or closed window stays pending and
can open the bank again, without another card. Browser tests stub the Culqi, Culqi3DS and
Turnstile scripts (`tests/support/payment.ts`), and the local API charges a fake Culqi and
Turnstile served by `scripts/fake-payment-services.mjs`.

## Content

The hotel has no pool or hot springs on the property. Mamahuarmi, La Juventud,
and Tingo are separate places nearby. Preserve that distinction in copy,
metadata, and structured data.

## Validation

Run commands from the repository root with `pnpm --filter @pms/website`.

- Run `check` and root `pnpm check` for code changes.
- Run `verify:build` for pages, assets, configuration, or translations. It checks
  locale parity, canonical URLs, redirects, sitemap entries, and the share image.
- Run `test:smoke` for routes, navigation, language selection, mobile menus,
  galleries, or reservation links. It builds with `PUBLIC_PMS_API_URL` pointing
  at a local API that `scripts/local-api.mjs` starts on a seeded D1 in `.local-api/`;
  it never calls production.
- Run `exec playwright test --project=a11y` against that build for markup,
  styles, images, or interactive UI. Serious and critical axe violations fail.
- Run `exec node scripts/check-links.mjs` against a fresh build for link changes.
  Add `--internal-only` to skip external requests.
- Install the test browser with `exec playwright install chromium` when needed.

Production website deployment stays in `meldarstudio/hotelmanantial` until an
explicitly requested cutover. Do not deploy this directory before that cutover.
Apply urgent production website fixes in both repositories to keep them aligned.

`check` runs `astro sync` then `astro-check` directly. The workspace package
extensions give the checker TypeScript 6 and its compatible WASM runtime;
Astro's wrapper rejects the workspace's TypeScript 7, which lacks the checker's
required programmatic API. Keep this compiler isolation when updating tooling.

## Routes and translations

Spanish pages live in `src/pages/`; English pages live in `src/pages/en/`.
Create one page file per locale. Slugs stay Spanish in both locales, including
`/en/habitaciones/`. Copy comes from `src/i18n/ui.ts` via `useTranslations`;
add keys to both languages. Build locale URLs with `astro:i18n` helpers.

URLs end in `/`. Add canonical slash redirects to `public/_redirects` when
adding routes. Astro config redirects produce meta refresh pages; Cloudflare
HTTP redirects belong in `_redirects`. Astro preview ignores that file.

The site origin appears in `astro.config.mjs`, both scripts in `scripts/`, and
`public/robots.txt`; update all four when changing domains. The build hook copies
the English 404 page to `dist/en/404.html` for Cloudflare.

## Source locations

- `src/lib/constants.ts`: contact details, map values, WhatsApp URL builder.
- `src/constants.ts`: brand name, socials, default metadata.
- `src/lib/rooms.ts`: room data; `src/lib/structured-data.ts`: JSON-LD.
- Import images from `src/assets` and use `astro:assets` Image with `layout`.
- Tailwind v4 uses `@tailwindcss/vite` and `src/styles/global.css`.
- Fonts are configured in `astro.config.mjs`, with Tailwind variables mapped
  by `@theme inline` in the global stylesheet.

## Agent sessions

Astro backgrounds dev and preview servers in agent sessions. Check
`exec astro dev status` before starting one; inspect `exec astro dev logs`
on failure and stop your server with `exec astro dev stop` when finished.
Keep Playwright's `--ignore-lock` preview flag: it keeps the server in the
foreground so Playwright can manage its lifecycle.
