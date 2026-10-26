# Portal shell and installed app

## Control styling

Desktop and mobile use the same compact Lyra control sizes and typography from
[the shared UI primitives](../apps/portal/src/components/ui), configured by
[components.json](../apps/portal/components.json). Use the primitives' size variants
by control role rather than adding mobile-only size or touch-target overrides.
Badges default to the standard size; use `size="sm"` for compact inline labels such
as the calendar's **Sucia** marker, on both desktop and mobile.
Responsive cards, toolbars, full-screen editors, navigation sheets, and safe-area
spacing remain independent of control sizing. This baseline does not establish
WCAG conformance; target sizing and spacing require review in the rendered UI.

## Navigation

The portal uses a narrow, flat sidebar for Reservas, Calendario,
[Limpieza](housekeeping.md), and Inventario y tarifas, with Configuración, Cuentas (Owner account only) and Salir at the bottom.
The header toggle fully hides the sidebar on desktop, reclaiming its width;
on phones it opens a dismissible navigation sheet. Desktop open/hidden state is
saved in this browser's local storage across refreshes and browser restarts,
defaulting to open without a saved preference. If storage is unavailable, the
choice lasts only for the current visit. Mobile navigation always starts closed
and does not change the desktop preference. Toggling does not remount the current
screen. Beside the toggle, the header shows the current section's name; a page can
replace it through `PageTitle` in
[page-title.tsx](../apps/portal/src/components/page-title.tsx), as the reservation
page does with its breadcrumb. Page bodies such as Reservas, Limpieza, and the
reservation page fill the content width with 16px padding, 24px from 1024px up,
so their content lines up across pages. Navigation retains the last
reservation filters and calendar dates, and existing unsaved-draft guards still
apply. Sign-out retains the existing authentication and error handling.

Below 768px, a page's main task floats at the bottom right as one standard Lyra button
for one-handed reach: **Nueva reserva** on Reservas and Calendario. It shows its
label while the page's scroll area is at the top and collapses to its icon once
that area scrolls more than 8px, including after automatic scrolls such as
pagination; its accessible name stays the label. A centered square icon area keeps
the collapsed button at Lyra's standard icon size. The label animates beside it
with content-driven button width, without switching size variants. Reduced-motion
preferences disable the label animation. It follows the header in focus order,
keeps safe-area spacing, and sits beneath dialogs, sheets, and the PWA update card.
Those scroll areas reserve bottom padding so their last content can
scroll clear of it. Wider screens keep each page's own placement: the header on
Reservas and the toolbar on Calendario.
[page-primary-action.tsx](../apps/portal/src/components/page-primary-action.tsx)
owns the slot that `App.tsx` provides.

The calendar and inventory URLs hold `from` and `span` values. Reservation list
views are arrivals, departures, in-house, and all reservations, with day, search,
status, balance, assignment, sorting, page size, and page encoded in the URL.
Defaults use the property date. Legacy `checkIn` and `status` URLs remain accepted.
The in-house view locks status to checked in. See
[route-search.ts](../apps/portal/src/lib/route-search.ts) for parsing and
[reservation list](reservations.md#portal-list) for responsive layout and filter
interaction rules.

Code-based TanStack Router routes live in
[router.tsx](../apps/portal/src/router.tsx);
[App.tsx](../apps/portal/src/App.tsx) owns the shell and
[app-sidebar.tsx](../apps/portal/src/components/app-sidebar.tsx) owns navigation.
Calendar bars open the compact editor; the list and **Ver reserva completa** open
the full page. See [reservation editors](reservations.md#portal-editors).

### Date navigation

Below 768px, Calendario and Inventario y tarifas use a single compact toolbar
row with **Actualizar** on the left and the previous-day button, start-date
picker, and next-day button in the middle. They use the same button sizes and
picker styling. **Hoy** lives in the picker's footer; choosing it returns to the
property date and closes the picker. The span selector and period-jump buttons
are omitted on mobile. Calendario also has its
[assignment button](calendar.md#entry) on the right.
Reservas places **Actualizar** and **Hoy** differently; see the
[reservation list](reservations.md#portal-list).

Inventario y tarifas keeps its 14-day default and honors an existing 7/14-day
URL span on mobile. Its rates remain editable through grid cells. Desktop
retains the span selector, standalone **Hoy**, refresh, day navigation, and
period-jump controls.

The inventory grid's sticky room-type column fits its names and room counts,
with a 7rem minimum and a maximum of 10rem on mobile or 13rem on desktop. Longer names truncate with an
ellipsis and retain the full name in their title. Date columns remain at least
5rem wide and scroll horizontally.

## Error states

These rules cover failed page reads. Save errors keep their toasts and field
errors, and a 401 returns to the login form (see
[portal sessions](authentication.md#portal-sessions)).
[page-error.tsx](../apps/portal/src/components/page-error.tsx) owns the shared
components; [api-error.ts](../apps/portal/src/lib/api-error.ts) classifies errors.

- **Nothing on screen yet:** `PageError` replaces only the page content. Date
  navigation, tabs, filters, and header actions stay usable. It explains one of
  three kinds:
  - **Not found** (404): only the reservation page has this state, offering
    **Volver a reservas** without a retry. Elsewhere a 404 is unexpected.
  - **No connection:** the request never reached the API. Offers **Reintentar**.
    A browser that reports itself offline already shows the full-screen notice
    from [installable app and offline behavior](#installable-app-and-offline-behavior).
  - **Unexpected:** everything else. Offers **Reintentar**.
- **Data already on screen:** a failed refresh keeps the data and shows
  `StaleDataNotice`: a `warning` variant of the shadcn `Alert` (the amber `warning`
  theme token) giving the reason, a warning that the data may be out of date, and
  **Reintentar**. Every page separates it from the content below with a gap.
  This applies only when the data on screen matches the requested range or list
  page; a failed new calendar or inventory window shows `PageError` instead of the
  previous window's data.
- **Copy:** pages show the Spanish translation from
  [errors.ts](../apps/portal/src/lib/errors.ts) when one exists. Errors without one
  get generic Spanish copy and are logged to the console, including unexpected
  404s and failed refreshes. Network failures and the reservation page's intentional
  not-found state already have an explanation and are not logged.
- **Retries:** reads are not retried after a 4xx response and are retried twice
  after connection or server failures ([query-client.ts](../apps/portal/src/lib/query-client.ts)).
  React Query refetches page reads when the browser reconnects. The full reservation
  page refreshes its saved overview without replacing open editor drafts. The
  compact calendar editor's reservation detail is an exception: it does not
  automatically refetch on reconnect. Both reservation editors keep window-focus
  refetch disabled ([queries.ts](../apps/portal/src/lib/queries.ts)).
- **Render crashes:** the router's default error component shows **Algo salió mal**
  with **Recargar** and **Ir al calendario**, inside the shell when only the page
  failed. It shows no technical details and logs the error to the console.

## Loading states

These rules cover a page's first read, before any data is on screen. Saves keep
their button spinners, and the session check keeps its full-screen spinner.

- **Placeholders, not spinners:** the content area shows `Skeleton` placeholders
  laid out like the loaded content: the same rows, cards, and columns, with grey
  bars where the data goes. Static column headings and card titles render as
  text. Date navigation, tabs, filters, and header actions stay usable. Spinners
  are only for an action in progress.
- **No layout shift:** placeholder rows, cards, and the booking dialog have the
  loaded content's heights, so nothing moves when the data arrives. Lists show a
  fixed number of placeholder rows (8 table rows, 3 Reservas phone cards); a
  shorter list moves up, but content above stays put. Values that appear with the
  data, such as the **Por limpiar** count badge, get a placeholder of the same size.
- **Typical data:** a placeholder matches the common case. The booking dialog
  matches a confirmed reservation with one room; a reservation with more rooms
  grows the form below the dates when it loads.
- **Known gaps:** the reservation page and Configuración still show a single grey
  block while loading.
- **Busy markup:** a placeholder region has `aria-busy` and a **Cargando …** label
  (for example **Cargando habitaciones**), which tests use to wait for the data.

To size a placeholder, measure the loaded page in a browser. With `pnpm dev`
running and the local sample data, sign in with Playwright (from a scratch
directory outside the repo; it is not a project dependency), then for each layout
at 1280px and 390px wide:

1. Load the page and record the `getBoundingClientRect()` of its rows, cells, and
   cards.
2. Reload while `page.route()` holds the page's API read unanswered, and record the
   placeholder's boxes.
3. Adjust the placeholder until heights and column positions match; widths of
   individual text bars only need to be close.

## API environment

Vite inlines `VITE_API_BASE_URL` at build time; a missing value fails the build.
The committed portal `.env.development` points to `http://localhost:8788`. Local
overrides belong in `apps/portal/.env.local`. There is no Vite proxy. Use the
[root commands](../README.md#commands) for development, builds, and preview.

Keep portal and API hostnames consistent for session cookies. The normal local
setup uses `localhost` for both. `localhost` and `127.0.0.1` are different sites;
mixing them prevents the Lax session cookie being sent. Credentialed CORS requires
the exact portal origin in backend `ALLOWED_ORIGINS`, overridden locally in
`apps/backend/.dev.vars`. Fetch helpers send `credentials: "include"`. See
[authentication](authentication.md#portal-sessions) for 401/cache behavior.

## Installable app and offline behavior

The portal can be installed through browser-native controls as **Hotel Manantial**
(**Manantial** on compact launchers). Its standalone launch destination is
`/reservations`; opening `/` in a normal browser still redirects to Calendario.
Installation does not add an in-portal install prompt or notification permission.

The service worker caches only the public application shell and static assets.
It does not cache API responses, session data, or hotel records, and does not
queue writes. Reservations and other hotel operations require an internet
connection. When a new version is ready, **Nueva versión disponible** offers a
floating card with a manual **Actualizar ahora** action; simply leaving the notice
alone does not reload the page. **Ahora no** and the close button hide that update
for the current tab session, including page reloads, without activating it. A new
tab session can show the notice again if the update is still waiting. If session
storage is unavailable, dismissal lasts only until the page reloads. While the browser reports itself offline, a full-screen **Sin conexión a internet**
notice in the shared page-error style hides the portal and offers **Reintentar**
(reload). After reconnecting, the portal reappears without a notice; page reads
follow the [reconnect rules and compact-editor exception](#error-states).

For release smoke tests, build and preview locally using the root build commands
and a non-production API origin. On Android Chromium, Safari on iOS/iPadOS, and
desktop Chromium where available, check native installation, app label/icon,
standalone launch, login and direct links, and ordinary-tab `/` behavior. After
an online visit, disable networking and launch/navigate: the shell should show
the Spanish offline message and retry should recover when networking returns.
Confirm no authenticated API response appears in Cache Storage and no write is
replayed after reconnecting. To check updates, keep an older preview open with
an unsaved draft while serving a newer build: defer the notice, verify no window
reloads, then choose **Actualizar ahora** and verify the existing unload/save guards.
Also check two open windows and confirm that the unchosen window is not forcibly
reloaded. Verify `/manifest.webmanifest`, `/sw.js`, and icon requests return their
actual content (not SPA fallback HTML). Record browser/device versions and
platforms not tested in the [private release record](operations-status.md#private-evidence).
See [operational status](operations-status.md) for recorded verification limits.
