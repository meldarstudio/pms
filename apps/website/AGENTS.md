# Website

Static Astro site for Hotel Manantial in Churín, Peru. Cloudflare serves `dist/`.
`PUBLIC_PMS_API_URL` is required; `.env.development` supplies the local backend URL, and the
release workflow supplies the production URL.

## Booking flow

- Choose is `/habitaciones/`, one Svelte island (`src/components/rooms/RoomsBooking.svelte`).
  Rooms are prerendered; live offers come from the PMS `/public` API at runtime, never in the HTML.
  `src/lib/rooms.ts` links each room to a PMS room-type ID.
- Review is `/reservar/revisar/`, one Svelte island (`src/components/reservation/review/Review.svelte`).
  Its checkout and payment decisions live in the pure `src/lib/reservation/checkout-flow.ts`
  (`next(state, event)` returns the next state and effects); `checkout-runner.ts` performs the
  effects, and the components render state and forward events.
- Payment status is read back from the checkout (`src/lib/reservation/payment.ts`), so reload,
  Back and language changes resume the existing attempt instead of charging again.
- Keep checkout and card tokens in `sessionStorage`, not in URLs (`src/lib/reservation/draft.ts`).
  The private summary (`/reservar/resumen/`) uses a separate bearer in the URL fragment only
  (`src/lib/reservation/summary.ts`). Keep it out of query strings and support links.
- Browser workflows run on Effect v4. Islands fork them through `startIsland` (`src/lib/island.ts`),
  which interrupts them on unmount, and call the PMS only through `PmsClient` (`src/lib/pms-client.ts`).
  It turns off Effect's `traceparent`/`b3` headers, which the backend's CORS allow-list rejects.
  `pmsGet` times out and retries network failures; `pmsPost` sends once, so never route a write
  through the retrying client: a retried payment or acceptance could be applied twice.
- Card payment needs build-time `PUBLIC_CULQI_PUBLIC_KEY` and `PUBLIC_TURNSTILE_SITE_KEY`;
  without either, Review says payment isn't available. In development `?payments=on|off`
  previews both modes.

## Content

The hotel has no pool or hot springs on the property. Mamahuarmi, La Juventud,
and Tingo are separate places nearby. Preserve that distinction in copy,
metadata, and structured data.

## Validation

Run commands from the repository root with `pnpm --filter @pms/website`.

- Run `verify:build` for pages, assets, configuration, or translations. It checks
  locale parity, canonical URLs, redirects, sitemap entries, and the share image.
- Run `test:smoke` for stay search, Review, payment, or the complaint form.
  Manually check mobile menu changes. Smoke runs against a local API that
  `scripts/local-api.mjs` starts with the backend's `cf dev` and a seeded D1 in
  `.local-api/`; Culqi, Culqi3DS and Turnstile are stubbed (`tests/support/payment.ts`,
  `scripts/fake-payment-services.mjs`). It never calls production.
- Run `exec node scripts/check-links.mjs` against a fresh build for link changes.
  Add `--internal-only` to skip external requests.
- Install the test browser with `exec playwright install chromium` when needed.

Keep `astro-check` and `svelte-check` isolated on TypeScript 6 through the workspace
package extensions. They need the programmatic API unavailable in the workspace's
TypeScript 7. Run `astro-check` directly because Astro's wrapper rejects TypeScript 7.

For an authorized deployment, pass `./dist` to `cf deploy`; without the directory,
`cf` would try to build the Astro project itself.

## Routes and translations

Spanish pages live in `src/pages/`; English pages live in `src/pages/en/`.
Create one page file per locale. Slugs stay Spanish in both locales, including
`/en/habitaciones/`. Copy comes from `src/i18n/ui.ts` via `useTranslations`;
add keys to both languages. Build locale URLs with `astro:i18n` helpers.

URLs end in `/`. Add canonical slash redirects to `public/_redirects` when
adding routes. Astro config redirects produce meta refresh pages; Cloudflare
HTTP redirects belong in `_redirects`. Astro preview ignores that file.

Update the site origin in `astro.config.mjs`, `scripts/check-links.mjs`,
`scripts/verify-build.mjs`, and `public/robots.txt` when changing domains. The build hook copies
the English 404 page to `dist/en/404.html` for Cloudflare.

## Source locations

- `src/lib/constants.ts`: contact details, map values, WhatsApp URL builder.
- `src/constants.ts`: brand name, socials, default metadata.
- `src/lib/structured-data.ts`: JSON-LD.
- `src/components/Footer.astro`: Libro de Reclamaciones link and Annex III notice.
  For complaint disclosures, use `@pms/shared/complaint-book.json` in `src/components/complaints/`.
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
