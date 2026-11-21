# Website

Static Astro site for Hotel Manantial in Churín, Peru. Cloudflare serves `dist/`.
The homepage always shows the prerendered Svelte stay search. `PUBLIC_PMS_API_URL` is required;
`.env.development` supplies the local backend URL, and the release workflow supplies the production URL.
Choose is the rooms page (`/habitaciones/`): one Svelte island
(`src/components/rooms/RoomsBooking.svelte`) with the dates-and-guests form and every
room, prerendered for search engines. It refreshes live offers from the PMS `/public`
API in place, never in the HTML. A searched stay hides rooms that cannot fit the group,
shows available rooms at their lowest total, and keeps sold-out and offline rooms visible.
Pending searches show loading placeholders instead of previous availability or prices;
choosing a room replaces that list with the room's rate plans, lowest selected, and one
Continue link to Review; phones repeat it with the total in a bottom bar while the summary's
Continue is off screen. The address names the stay, the opened room and its rate plan:
opening a room pushes history, choosing a plan or searching replaces it, and Back, Forward
and reload show the step it names. A completed search scrolls to its notice or far enough
to show the first available room's full price, without moving focus. The last
search is kept in `sessionStorage` (`src/lib/reservation/stay-search-storage.ts`) so the homepage
and Choose prefill it; dates before the first online arrival are dropped. Review (`/reservar/revisar/`) opens a private checkout, shows
its server Quote, and records the booking contact's acceptance, including an
optional note that the paid reservation keeps. Pay refreshes an
expired quote and keeps that acceptance only when the guest is paying; an unchanged
offer is charged, and a changed offer, including a lower price, is shown for a new
acceptance and is not charged. Accepting an expired quote also refreshes, then records
the contact and language just submitted. The checkout token
lives only in `sessionStorage` (`src/lib/reservation/draft.ts`), never in URLs.
The private summary (`/reservar/resumen/`) reads `GET /public/reservation` with the
access token from the URL fragment only, sent as `Authorization: Bearer` with
`referrerPolicy: "no-referrer"`. When a payment confirms the reservation, Review
stays as completed checkout with the saved agreement, reference, authoritative
amounts and hotel contact options. It clears the contact draft independently of
the optional access-link read, retaining checkout credentials for outcome recovery.
Each saved outcome reads access once; a failed or unestablished link can only be
retried manually. Confirmed outcomes use the welcome layout in `review/Confirmation.svelte`,
with explicit summary navigation and browser printing; other saved outcomes retain copying.
Link loading is announced to assistive technology, with explanatory copy visible only on failure.
`review/PrintConfirmation.svelte` prints the saved agreement and backend reservation amounts,
independently of access-link availability. Print styles exclude navigation, controls and private
links. The summary is not a wizard step and marketing pages do not link to it.
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
Parameters continue the same attempt. A Culqi3DS error message is the bank refusing the
check: Review reports it for that attempt and shows the declined outcome, so another card
can pay. A closed window or a failure to load Culqi3DS stays pending and can open the bank
again, without another card. Browser tests stub the Culqi, Culqi3DS and
Turnstile scripts (`tests/support/payment.ts`), and the local API charges a fake Culqi and
Turnstile served by `scripts/fake-payment-services.mjs`.

Review is one Svelte island, `src/components/reservation/review/Review.svelte`, mounted by
`ReservationReview.astro` with build-time copy (`review/text.ts`), rooms and payment keys.
Review renders the step bar with links to completed steps, and the phone and WhatsApp booking alternatives.
Review applies each `next` transition and flushes the DOM before running its effects, so
focus and the security check find their targets. It disposes the runner on unmount.
In development `?payments=on|off` previews both payment modes.

## Content

The hotel has no pool or hot springs on the property. Mamahuarmi, La Juventud,
and Tingo are separate places nearby. Preserve that distinction in copy,
metadata, and structured data.

## Validation

Run commands from the repository root with `pnpm --filter @pms/website`.

- Run `check` and root `pnpm check` for code changes, and `test` for the unit tests
  (`vp test run`). Review's checkout and payment decisions live in the pure
  `src/lib/reservation/checkout-flow.ts` (`next(state, event)` returns the next state
  and effects); `checkout-runner.ts` performs the effects, and the Svelte components in
  `src/components/reservation/review/` render the state and forward events.
- Run `verify:build` for pages, assets, configuration, or translations. It checks
  locale parity, canonical URLs, redirects, sitemap entries, and the share image.
- Run `test:smoke` for stay search, Review, payment, or the complaint form.
  Manually check mobile menu changes. Smoke builds with `PUBLIC_PMS_API_URL` pointing
  at a local API that `scripts/local-api.mjs` starts with the backend's `cf dev`
  and a seeded D1 in `.local-api/`; it never calls production.
- Run `exec node scripts/check-links.mjs` against a fresh build for link changes.
  Add `--internal-only` to skip external requests.
- Install the test browser with `exec playwright install chromium` when needed.

The release workflow supplies `PUBLIC_TURNSTILE_SITE_KEY` and `PUBLIC_CULQI_PUBLIC_KEY`
from repository variables. Deploy the verified static build with `cf deploy ./dist`;
without the directory, `cf` would try to build the Astro project itself.

The footer of every page links the Libro de Reclamaciones and shows the Annex III notice
(`src/components/complaints/`). The form is prerendered with the provider and privacy
texts of `@pms/shared/complaint-book.json`; when the backend rejects its policy version, the
guest reloads and the draft is restored. It submits only with `PUBLIC_TURNSTILE_SITE_KEY`;
development falls back to Cloudflare's always-passing test key.

Keep `astro-check` and `svelte-check` isolated on TypeScript 6 through the workspace
package extensions. They need the programmatic API unavailable in the workspace's
TypeScript 7. Run `astro-check` directly because Astro's wrapper rejects TypeScript 7.

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
- Import images from `src/assets` and use `astro:assets` `Image` or `Picture` with `layout`.
- Reserve the top level of `/_astro/` for fingerprinted build output. If an image
  encoder upgrade needs to replace a cached image, change its source or transform
  so the generated URL changes.
- Tailwind v4 uses `@tailwindcss/vite` and `src/styles/global.css`.
- Fonts are configured in `astro.config.mjs`, with Tailwind variables mapped
  by `@theme inline` in the global stylesheet.

## UI SDK

Svelte components build on `@ui-sdk/svelte`. Before using ui-sdk, follow the `ui-sdk` skill
and read `node_modules/@ui-sdk/svelte/docs/llms.txt`. To build a new component, also search
`node_modules/@ui-sdk/svelte/docs/core.md` by heading and read `rendering.md` next to it.
The site does not load the SDK's `web.css` theme: style each part through its `data-slot`
and state attributes, as `src/styles/global.css` centres dialogs.

## Agent sessions

Astro backgrounds dev and preview servers in agent sessions. Check
`exec astro dev status` before starting one; inspect `exec astro dev logs`
on failure and stop your server with `exec astro dev stop` when finished.
Keep Playwright's `--ignore-lock` preview flag: it keeps the server in the
foreground so Playwright can manage its lifecycle.
