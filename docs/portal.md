# Portal shell and installed app

## Control styling

Use the compact Lyra size variants from [shared UI primitives](../apps/portal/src/components/ui)
and [components.json](../apps/portal/components.json) on desktop and mobile; avoid
mobile-only control/touch-target overrides. Responsive layout and safe-area spacing
are separate concerns. Rendered target sizing/spacing still needs accessibility review.

## Navigation

[router.tsx](../apps/portal/src/router.tsx) owns routes, `App.tsx` the shell, and
`app-sidebar.tsx` navigation. Configuración owns rooms, appearance, and owner-only
accounts; see [setup](property-setup.md#portal-setup). `PageTitle` lets pages replace
the shared heading, including reservation breadcrumbs.

Desktop sidebar preference persists in local storage, falling back to visit-only
state if unavailable; mobile starts closed without changing it. Toggling does not
remount screens. Navigation retains reservation filters/calendar dates and draft guards.

Below 768px, **Nueva reserva** uses `page-primary-action.tsx`'s floating slot on
reservations/calendar. Keep its accessible label, focus order, safe areas, reduced
motion, and content clearance even when its visual label collapses on scroll.
Dialogs/sheets/update notices sit above it.

URL search parsing/defaults live in [route-search.ts](../apps/portal/src/lib/route-search.ts).
Calendar/inventory use `from`/`span`; reservations retain view/day/filter/sort/pagination
context and legacy URLs. Defaults use [property dates](calendar.md#property-dates).
Editor entry points are documented with [reservations](reservations.md#portal-editors).

### Reservation overlays

The reservation page's stay, contact, notes, guest and payment editors fill the visible
phone viewport, following its height and top offset when the keyboard changes it.
Their fields scroll independently of the actions; safe-area padding keeps controls
clear of screen edges. Resizing does not remount the forms or discard drafts, and
closing/navigation retain the existing unsaved-change guards. Desktop editor width
limits are unchanged.

Status corrections, cancellation/restoration and record-deletion confirmations remain
inset with scrolling content and visible actions, as do the shared lifecycle
confirmations. The full-screen treatment is for reservation editors, not refund dialogs. The page's
contextual header action and overflow menu replace its status select; behavior belongs
to the [full reservation page guide](reservations.md#full-reservation-page).

### Date navigation

Mobile calendar/inventory share compact day navigation with **Hoy** in the picker
footer, without span/period-jump controls. Calendar starts the day before today;
inventory keeps its 14-day default and honors existing 7/14-day URL spans. Rates
remain editable in inventory cells. Desktop retains span/period controls. Reservations
retain view-specific date controls. Date selection closes the picker.

## Error states

[page-error.tsx](../apps/portal/src/components/page-error.tsx) and
[api-error.ts](../apps/portal/src/lib/api-error.ts) own failed-read presentation.
Writes retain field errors/toasts; [401 handling](authentication.md#portal-sessions)
returns to sign-in.

- With no matching data, `PageError` replaces content but leaves navigation/filter
  controls usable. Reservation detail alone has intentional 404/back navigation;
  other 404s are unexpected. Connection/unexpected errors offer retry.
- Failed refreshes retain matching data with `StaleDataNotice` and retry. A failed
  new calendar/inventory window shows `PageError`, not old data under new dates.
- Translate known errors with `errors.ts`; otherwise show generic Spanish and log.
  Network failures and intentional reservation 404s are not logged.
- Do not retry 4xx reads; retry connection/server failures twice (`query-client.ts`).
  Reconnect refetches page reads without replacing drafts. Compact reservation
  detail is an exception: no automatic reconnect refetch. Both editors disable
  focus refetch (`queries.ts`).
- Router render errors offer reload/calendar navigation, log technical details
  without displaying them, and retain the shell when only the page failed.

## Loading states

First reads use content-shaped `Skeleton` placeholders, keeping static headings
and controls usable. Reserve spinners for actions and the session gate. Regions
need `aria-busy` and a Spanish loading label. Match typical loaded geometry to avoid
layout shift; the reservation page still has a single-block placeholder.

Measure loaded versus delayed-read boxes in a browser at desktop/phone widths
before adjusting geometry. Use disposable local sample data and the real sign-in
flow. Playwright, if needed, runs from a scratch directory outside this repo; it
is not a project dependency.

## API environment

`VITE_API_BASE_URL` is required and inlined at build time. Development points to
`http://localhost:8788`; local overrides belong in `apps/portal/.env.local`. There
is no Vite proxy. Use [root commands](../README.md#commands).

Portal/API must use consistent hostnames (`localhost`, not mixed with `127.0.0.1`)
for Lax cookies. Backend `ALLOWED_ORIGINS` must include the exact portal origin;
override it in backend `.dev.vars`. Requests include credentials. See
[authentication](authentication.md#portal-sessions) for cache clearing on 401.

## Installable app and offline behavior

Native installation launches `/reservations`; ordinary-tab `/` redirects to
calendar. There is no in-app installation prompt or notification permission.

`ThemeProvider` resolves title-bar `theme-color` from `--background`; retain a
concrete sRGB value usable by browser chrome. It follows saved/system preferences,
the **D** shortcut, and cross-window changes. HTML/manifest/offline fallback start
white; standalone offline remains light. Native chrome remains browser-managed.

The service worker caches **only public shell/static assets**, never API/session/
hotel data, and queues no writes. Operations require internet. An update offers
manual activation, never automatic reload. Deferral/close suppresses that update
for the tab session, including reloads; without session storage it lasts until
reload. New tabs can offer it again. Browser-reported offline state hides the app
behind a Spanish retry/reload notice; reconnect restores it with the read rules above.

### Manual PWA verification

Build/preview with a nonproduction API using [root commands](../README.md#commands).
On Android Chromium, iOS/iPadOS Safari, and desktop Chromium where available:

1. Check native install/icon/label, standalone launch, login/direct links, ordinary
   `/`, and title-bar themes after relaunch, system changes, and across windows.
2. After an online visit, launch/navigate offline and verify retry recovery. Confirm
   Cache Storage has no authenticated responses and reconnect replays no writes.
3. Keep an old build open with a draft while serving a new build. Defer the update,
   verify no reload, then activate and verify existing unload/save guards. Another
   open window must not be forcibly reloaded.
4. Verify manifest, service worker, and icon URLs return actual content, not SPA HTML.
   Record browser/device versions and untested platforms in the
   [private release record](releases.md#private-evidence).
