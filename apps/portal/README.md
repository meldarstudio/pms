# Portal

The portal is a Vite+ SPA deployed as static assets on the `pms-portal`
Cloudflare Worker.

Run it locally from the repository root:

```sh
pnpm dev:portal
```

The portal reads its API URL from `VITE_API_BASE_URL`, which Vite inlines at
build time. `.env.development` sets it to `http://localhost:8788`, the port the
backend dev script uses. It must be `localhost`, not `127.0.0.1`, so the browser
treats the portal and API as the same site and sends the session cookie. Override it in `.env.local`. A build fails if the variable is missing.

## Property setup

After signing in, calendar, reservations, and inventory stay accessible even when
property setup is incomplete. Their setup empty states link to `/setup`, and the
**Configuración** tab keeps it accessible at any time. Inventory remains editable
when room types exist without rooms, so rates can be configured first. Each
deployment manages one property; there is no hotel profile or account-creation step.

The room-type list opens an editor for the type's name, base nightly rate in PEN,
separate maximum adults and maximum children, and a table of its physical room numbers. **Agregar habitación**
adds a blank row. Unsaved rows can be removed; saved rooms and types cannot be
deleted here. Room numbers are unique across the entire property.

**Guardar cambios** saves the selected type and all proposed room additions and
number edits atomically. New types can be saved with no rooms. Setup is ready for
reservations when at least one saved room exists, at which point **Ir al calendario**
is available. There is no separate setup-completion flag or final wizard submission.

Switching types with a draft prompts to save, discard, or keep editing. Router
navigation and browser unload also protect unsaved changes; router navigation is
blocked while saving. Explicit sign-out keeps the app's existing behavior.
Validation and save failures retain the draft, with known conflicts shown beside
the affected fields. A failed background refresh does not replace an open editor.
Configuration saves use last-write-wins rather than concurrent-edit detection.

Limits are per room and enforced separately: a king with limits of 2 adults and
2 children accepts that family arrangement but rejects 3 adults or 3 children.
The child limit can be 0. These are hard limits, not recommendations or staff
warnings. Rates are per room-night and do not depend on occupant counts.
No child ages or automatic age classification are introduced.

Base-rate changes leave saved reservation prices intact. Lower adult or child limits
retain unchanged reservations; subsequent changes use the current validation rules.
Room reassignment and dated rate overrides stay in their existing screens.

`tests/setup.test.ts` exercises the real page and router through happy-dom with
HTTP responses substituted at the fetch boundary. The backend setup tests cover
the actual API and transactional database behavior.

## Reservation forms

`/reservations/:id` is a read-first overview with back navigation, booking contact
name with status/date badges, the reservation code and contact phone beneath it,
and right-aligned **Editar reserva** and a split status button. The button shows
the current state and opens a dropdown with the other states and cancellation.
**Registrar pago** remains in the payment
summary. Reservation data and a payment summary sit side by side on desktop and
stack on phones. The summary distinguishes outstanding, settled, and credit
balances; it is a reservation bill, not an invoice.
The bill shows subtotal, discount (including zero), total, amount paid, and balance.
The discount row has its own **Editar descuento** action; **Editar reserva** appears
only in the page header.

The overview currently ends at the two summary cards while their design is being
refined. Lower contact, guest, notes, payment-record, and account sections are
deferred; their editor workflows remain implemented. Declared occupancy stays
distinct from the optional guest list and remains editable in the stay editor.
The reservation data card omits occupancy and guest counts, quick-action buttons,
and row dividers.
The page does not offer unsupported invoice, payment-request, web check-in,
history, attachment, or task controls from the design reference.

**Editar reserva** opens a centered desktop dialog/full-screen mobile editor with
visible **Contacto** and **Estadía** sections. Contact name, phone, email and document
details share one draft with stay dates, room types, assignments and occupancy.
**Guardar cambios** sends their changes together in one atomic workflow command,
reusing the compact dialog's availability, capacity and server billing previews.
Contact typing does not invalidate the current operational preview. Notes, guests,
payments, discount and status changes retain their focused editor workflows.
Cancellation and restoration show the resulting server bill and operational
conflicts before confirmation; check-in and checkout do not change stay dates or
require a settled balance or physical room assignment.

Editors capture their opening values so background reads do not replace drafts.
Failed saves retain drafts, dismissing a dirty editor asks for confirmation, and
router navigation/browser unload are guarded while dirty or saving. Successful
commands refresh the overview and related reservation/calendar/inventory queries.
Back always opens Reservations, including calendar-origin and direct detail links.
Reservation-list filters are preserved when returning from a list-origin detail link.
The compact calendar dialog remains the utility-focused editor.

The reservation editor uses TanStack Form with portal-local Zod 4 schemas in
`src/lib/reservation-form-schemas.ts`. Details, guest add/edit, payment add/edit,
discount, and cancellation have independent form instances. API writes still use
TanStack Query and workflow commands with retry-safe request IDs.

Validation runs on blur and on submit, then on change after a submission attempt.
Room counts and capacity validate on change because they control billing previews.
Known server validation errors appear beside fields; other write failures use
error toasts. Query failures stay beside the content they block.

Run `pnpm exec vp test` from the repository root for both test projects,
`pnpm test` to run backend then portal, or `pnpm --filter @pms/portal test`
for the portal alone. Tests use `vite-plus/test` and do not need a browser.
The dialog suite in `tests/reservation-dialog.test.ts` and the full-page suite in
`tests/reservation-page.test.ts` use happy-dom and a Vite SSR server with an explicit
portal root to render actual components with HTTP responses substituted at fetch.

Run `pnpm check` for Oxfmt, Oxlint, and native type checks across the portal,
backend, and shared schemas. Native checking covers portal source, Vite
configuration, and tests. The solution tsconfig references `tsconfig.app.json`,
`tsconfig.node.json`, and `tests/tsconfig.json`.
The test config inherits the app's strict options and adds Node types. The
dialog harness uses happy-dom types, with a DOM type conversion at React's
`createRoot` boundary and module assertions for Vite's dynamic SSR loader.

The portal and backend use the same TypeScript 7 catalog dependency from
`pnpm-workspace.yaml`. Vite+'s checker also uses TypeScript 7. For a standalone
compiler check, run `pnpm --filter @pms/portal exec tsc -b`. `pnpm build` runs
the full workspace check before bundling without a duplicate compiler check.

The root `vite.config.ts` uses Oxfmt defaults across maintained repo files, with Tailwind
class sorting for portal TS/TSX files. Run `pnpm format` for the whole repo or
`pnpm exec vp fmt apps/portal` for only the portal. Generated files are
excluded. For targeted diagnostics, run `pnpm exec vp check apps/portal`
from the repository root. React Hooks rules remain portal-only, and browser
globals apply to portal source and tests.

## Signing in

`AuthGate` in `src/components/auth-gate.tsx` wraps the router. It asks the API for
the session and shows the login form when there is none. Every request sends
`credentials: "include"`. A 401 from any API call clears cached data and shows the
login form again, keeping the current URL, so signing in returns to the same page.
Backend login errors are translated in `src/lib/errors.ts`.

### Property calendar

The authenticated login/session response supplies `propertyTimeZone`; there is no
frontend timezone environment variable. Missing or invalid metadata blocks the
app with an actionable Spanish configuration error rather than briefly using
browser or UTC dates. Deploy the backend before this portal version.

Operational defaults, arrival badges, booking restrictions, payment validation,
and picker today/month indicators use that timezone. A shared clock refreshes at
property midnight and on focus/visibility changes, without signing in again.
Explicit URL dates and form drafts stay unchanged; new forms use the current day.
The picker adapter transfers calendar components into and out of zoned picker
Dates, not instants. Existing date labels remain identical in remote browsers.
UTC date arithmetic elsewhere counts nights or preserves labels only.

See the [backend release plan](../backend/README.md#property-timezone-release-23)
for migration ordering and old/new backend/portal compatibility.

## Reservation list filters

The **Filtros** button counts changed filter groups, not individual selections:
Estados, Saldo, and Asignación each contribute at most one. Defaults are relative
to the selected view, and the count is hidden at zero. Text search does not count;
its own clear button remains available. Applied filters are inspected and edited
inside the panel rather than in a separate row of chips.

Filters apply immediately and leave the panel open. **Restablecer** restores the
current view's default statuses, any balance, and any assignment, returning to the
first page. It preserves text search, view, selected day, sorting, and page size,
and is disabled when the three filter groups already match their defaults.

At least one status must remain selected; the final checked status is disabled
until another is selected. All four checked means unrestricted, including
cancellations. Legacy empty/`all` URLs and explicit four-status URLs restore that
same selection. Llegadas and Salidas default to Confirmada, Check-in, and
Check-out; Todas las reservas defaults to all four. En casa remains locked to
Check-in and hides the status selector. The panel heading is visually hidden but
retained as its accessible name.

## Deployment

Production portal: `https://app.hotelmanantialchurin.com`

Follow [the release checklist](../../docs/releases.md). The manual workflow builds
with the production API origin, checks migration readiness, then deploys the API
before this already-built portal from the same SHA. It does not disable existing
Workers Builds; the separately authorized cutover covers both applications.
Old tabs and installed-app windows may defer updates, so ordinary releases must
remain compatible with the previous portal.

### Installable app and offline behavior

The portal can be installed through browser-native controls as **Hotel Manantial**
(**Manantial** on compact launchers). Its standalone launch destination is
`/reservations`; opening `/` in a normal browser still redirects to Calendario.
Installation does not add an in-portal install prompt or notification permission.

The service worker caches only the public application shell and static assets.
It does not cache API responses, session data, or hotel records, and does not
queue writes. Reservations and other hotel operations require an internet
connection. When a new version is ready, **Nueva versión disponible** offers a
manual **Actualizar** action; simply leaving the notice alone does not reload
the page.

For release smoke tests, build and preview locally using the root build commands
and a non-production API origin. On Android Chromium, Safari on iOS/iPadOS, and
desktop Chromium where available, check native installation, app label/icon,
standalone launch, login and direct links, and ordinary-tab `/` behavior. After
an online visit, disable networking and launch/navigate: the shell should show
the Spanish offline message and retry should recover when networking returns.
Confirm no authenticated API response appears in Cache Storage and no write is
replayed after reconnecting. To check updates, keep an older preview open with
an unsaved draft while serving a newer build: defer the notice, verify no window
reloads, then choose **Actualizar** and verify the existing unload/save guards.
Also check two open windows and confirm that the unchosen window is not forcibly
reloaded. Verify `/manifest.webmanifest`, `/sw.js`, and icon requests return their
actual content (not SPA fallback HTML). Record browser/device versions and
platforms not tested for each release; this implementation has not been
validated on physical devices by this change.
