# Portal shell and installed app

## Navigation

The portal uses a narrow, flat sidebar for Reservas,
Calendario, and Inventario y tarifas, with Configuración and Salir at the bottom.
The header toggle fully hides the sidebar on desktop, reclaiming its width;
on phones it opens a dismissible navigation sheet. Desktop open/hidden state is
saved in this browser's local storage across refreshes and browser restarts,
defaulting to open without a saved preference. If storage is unavailable, the
choice lasts only for the current visit. Mobile navigation always starts closed
and does not change the desktop preference. Toggling does not remount the current
screen. Navigation retains the last
reservation filters and calendar dates, and existing unsaved-draft guards still
apply. Sign-out retains the existing authentication and error handling.

Below 768px, a page's main task floats at the bottom right as one 48px button
for one-handed reach: **Nueva reserva** on Reservas and Calendario. It shows its
label while the page's scroll area is at the top and collapses to its icon once
that area scrolls more than 8px, including after automatic scrolls such as
pagination; its accessible name stays the label. It follows the header in focus
order, keeps safe-area spacing, and sits beneath dialogs, sheets, and the PWA
update card. Those scroll areas reserve bottom padding so their last content can
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

Inventario y tarifas keeps its 14-day default and honors an existing 7/14-day
URL span on mobile. Its rates remain editable through grid cells. Desktop
retains the span selector, standalone **Hoy**, refresh, day navigation, and
period-jump controls.

The inventory grid's sticky room-type column fits its names and room counts,
with a 7rem minimum and a maximum of 10rem on mobile or 13rem on desktop. Longer names truncate with an
ellipsis and retain the full name in their title. Date columns remain at least
5rem wide and scroll horizontally.

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
storage is unavailable, dismissal lasts only until the page reloads. Offline and
connection-restored messages keep their existing behavior.

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
