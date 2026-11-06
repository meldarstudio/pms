# Website

Static Astro site for Hotel Manantial in Churín, Peru. Cloudflare serves `dist/`.
Reservation links currently open WhatsApp. Public PMS checkout is not wired yet.

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
  galleries, or reservation links. It also builds and verifies the site.
- Run `exec playwright test --project=a11y` against that build for markup,
  styles, images, or interactive UI. Serious and critical axe violations fail.
- Run `exec node scripts/check-links.mjs` against a fresh build for link changes.
  Add `--internal-only` to skip external requests.
- Install the test browser with `exec playwright install chromium` when needed.

Website deployment is separate from the PMS production release workflow.
Root production safety rules apply to this site's Cloudflare deployment too.

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

The site origin appears in `astro.config.mjs` and both scripts in `scripts/`;
update all three when changing domains. The build hook copies the English
404 page to `dist/en/404.html` for Cloudflare.

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
