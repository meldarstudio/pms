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

## Navigation

The portal uses the selected **A2** design: a narrow, flat sidebar for Reservas,
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

The comparison and design verdict are preserved on `prototype/sidebar-navigation`
at commit `48460e6`, in `src/components/navigation-prototype.md`. The implementation
contains only A2, with no variant URL parameter or prototype controls.

## Property setup

After signing in, calendar, reservations, and inventory stay accessible even when
property setup is incomplete. Their setup empty states link to `/setup`, and the
**Configuración** sidebar link keeps it accessible at any time. Inventory remains editable
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

**Nueva reserva**, from Calendar or Reservations, uses a full-screen editor below
768px and retains the centered desktop dialog. On mobile, only the form body
scrolls: the title/close control and the total with **Cancelar / Crear reserva**
remain reachable. Stay dates, reserved-room groups, booking contact, notes, and bill
details share one form, with the discount in the bill details. Safe-area spacing
and visual-viewport resizing accommodate mobile browser chrome and keyboards
without remounting drafts. Closing a dirty form still requires confirmation;
closing while saving remains blocked. There is no swipe-to-dismiss gesture.
Mobile reserved rooms use flat sections: a single room has no extra numbered
heading or removal action; multiple rooms have separators, numbered headings, and
quiet **Quitar** actions. Any room can be removed while more than one remains.

Editing an existing reservation from a calendar bar also uses a full-screen editor
below 768px. The compact contact/status header, **Detalles / Huéspedes / Pagos**
tabs, and bottom controls remain visible while only the content scrolls. The mobile
header keeps the contact name and saved status beside **Más acciones de reserva**
and Close, with phone and reservation code underneath. **Ver reserva completa**
moves into that menu on mobile; desktop keeps its inline link and footer menu. Stay
fields stack vertically; reserved rooms use flat sections with numbered headings
and quiet **Quitar** actions only when multiple rooms remain. Dates still apply to
the whole reservation. The persistent financial strip spans the footer width and shows only the balance,
using the bill's existing red outstanding, green settled, and blue credit colors
with text labels and a **Vista previa** badge beside the balance label for unsaved
pricing previews. Total remains in the bill.
Unavailable prices are not replaced with stale saved amounts. The entire balance
bar toggles the complete bill inside the scrolling content without replacing its
discount draft or changing discount autosaving. An upward chevron indicates the
collapsed bill above the footer; a downward chevron indicates the expanded bill.
There is no separate visible **Ver desglose** link. The button retains an accessible
**Ver desglose / Ocultar desglose** name, balance description, and expanded state,
and remains usable while prices are calculating or unavailable. While details are dirty, the
mobile footer shows quiet **Descartar** followed by primary **Guardar cambios**; other tabs
offer **Volver a Detalles** before saving that draft. When Details is clean, the
applicable check-in/checkout action and **Cerrar** share the action row equally.
Without an applicable lifecycle action, **Cerrar** remains available on its own.
Header/footer controls retain Lyra's spacing and safe areas. Mobile footer buttons
have a 44px minimum visual height in both creation and editing; draft action pairs
also share their row equally.
**Más acciones de reserva** retains
cancellation and status corrections with their existing safeguards. Keyboard
viewport resizing, safe-area spacing, and dirty-close protection follow creation;
there is no swipe-to-dismiss. Closing leaves the calendar and its scroll position
in place. Desktop editing and the full reservation page retain their layouts.

`/reservations/:id` is a read-first overview with back navigation, booking contact
name with status/date badges, the reservation code beneath it,
and a right-aligned **Estado de la reserva** select. Selecting Confirmada,
Check-in, or Check-out on an active reservation saves immediately without another
confirmation or save button. Selecting Cancelada opens a consequence-aware
confirmation; selecting an active status on a cancelled reservation opens a
restoration confirmation with a fresh server bill and availability validation.
The select shows the saved status, stays disabled during writes, and retains the
previous status after a failed save so the same choice can be retried safely.
The compact calendar dialog shows the saved status beside the booking-contact
name and offers the next check-in or checkout action directly. That action saves
immediately. **Guardar cambios** saves only the details form.
**Registrar pago** remains in the payment
summary. Contact and payment sections occupy the left column, with the stay
section on the right on desktop; all three stack on phones. The summary distinguishes outstanding, settled, and credit
balances; it is a reservation bill, not an invoice.
The bill shows subtotal, discount (including zero), total, amount paid, and balance.
The discount row has its own **Editar descuento** action.

The page is the complete reservation-management workspace, expanded incrementally,
while the calendar dialog stays compact and operations-focused. **Contacto principal**
shows name, phone, and email with an **Editar contacto** action. The phone link
appears only in this card, not in the page header. Document fields are not
requested or displayed for booking contacts; contact saves omit them to
preserve existing stored values. Staying-guest document fields remain unchanged.
**Estadía y habitaciones** has its own **Editar estadía** action. Guest, notes,
payment-record, and account sections remain deferred; their editor workflows
remain implemented. Declared occupancy stays
distinct from the optional guest list and remains editable in the stay editor.
The stay summary shows one **Ocupantes** total, adding adults and children across
all reserved rooms—not the optional named guest list. Below it, **Habitaciones
asignadas** shows the room count and a bordered list: each row has a bed icon,
room number and type, with adult/child counts underneath. Unassigned rooms show
**Sin asignar**. Per-room occupancy remains editable in the stay editor.
The page does not offer unsupported invoice, payment-request, web check-in,
history, attachment, or task controls from the design reference.

Contact and stay edits open separate centered desktop dialogs/full-screen mobile
editors, each with independently saved drafts and reachable save/cancel controls
while the form body scrolls. Contact editing corrects the existing record's name,
phone, and email fields; it does not search for or replace the contact.
Stay dates, room types, assignments, and occupancy save together through
**Guardar cambios**, reusing the compact dialog's availability, capacity and server
billing previews. The focused stay editor does not expose calendar tabs, notes,
payments, guest editing, discount editing, or lifecycle controls. Contact saves
need no operational preview. Notes, guests, payments, discount and status changes
retain their focused editor workflows.
Cancellation uses a consequence-aware confirmation with a fresh server bill.
Compact-calendar restoration is selected from **Más acciones de reserva →
Cambiar estado** and opens the same **Restaurar reserva** confirmation as the page.
It previews the restored bill and availability before writing. **Guardar cambios**
does not change status. Cancellation releases
inventory and zeros charges while retaining payments as credit, not a refund.
Check-in and checkout do not change stay dates or require a settled balance or
physical room assignment. Lifecycle writes show pending/success/error feedback,
block duplicate and overlapping reservation writes, and reuse the request ID when
retrying an unchanged action after an uncertain response.

Editors capture their opening values so background reads do not replace drafts.
Room-type menus offer only types with capacity for the stay dates, accounting for
other reservations, room closures, and the other draft rooms. The current selection
remains visible to preserve drafts, and type changes wait for current availability
to load. Server previews still validate availability before saving.
Failed saves retain drafts, dismissing a dirty editor asks for confirmation, and
router navigation/browser unload are guarded while dirty or saving. Successful
commands refresh the overview and related reservation/calendar/inventory queries.
Back always opens Reservations, including calendar-origin and direct detail links.
Reservation-list filters are preserved when returning from a list-origin detail link.
The compact calendar dialog remains the utility-focused editor. Its header shows
`[booking contact] [status]` and `[phone] [reservation code]`, without the
booking-contact email. Desktop keeps the inline open-reservation action; mobile
places it in the header's overflow menu. Active check-in and checkout actions save
immediately and do not alter the details draft. **Guardar cambios** saves dates,
rooms, and notes only; **Descartar cambios** (**Descartar** on mobile) resets that draft. Status does not
participate in the page's stay-only editor. The ellipsis menu contains destructive
**Cancelar reserva** and **Cambiar estado**, whose radio choices show and correct
the saved reservation status. On an active reservation those choices save
immediately. On a cancelled reservation they open **Restaurar reserva** for the
chosen status; dismissing it leaves the reservation cancelled. A successful
restoration leaves the compact dialog open and refreshes the saved status. Dirty
details, guest, payment, or discount drafts block restoration. Cancellation has its
own preview and confirmation; it explicitly discards unsaved details and closes the
compact dialog only after success. Failed or dismissed cancellation preserves the
details draft. Dirty details, guest, payment, discount, or nested-editor drafts
block check-in, checkout, and status correction until saved or discarded. A dirty
guest, payment, or discount draft also blocks cancellation. A dirty details draft
does not: cancellation remains available and states that confirming discards those
details. Pending
writes, including discount autosaves, block overlapping writes; failed drafts
remain intact. The page uses its independent auto-saving status select.

The reservation editor uses TanStack Form with portal-local Zod 4 schemas in
`src/lib/reservation-form-schemas.ts`. Details, guest add/edit, payment add/edit,
discount, and cancellation have independent form instances. API writes still use
TanStack Query and workflow commands with retry-safe request IDs.

`src/lib/use-stay-draft.ts` owns the shared stay draft, validation feedback,
preview timing, reusable prices, and draft reset for compact-calendar and page
stay editing. It also retains the compact editor's notes. Rendering uses its
summary and submission state rather than coordinating preview queries. Submission
can reveal invalid fields even when a write is not allowed; write guards,
workflow commands, and independent guest/payment/discount/status drafts remain
with their existing editors.

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
compiler check, run `pnpm --filter @pms/portal exec tsc -b`. Root `pnpm build` runs
the full workspace check before bundling without a duplicate compiler check.

The root `vite.config.ts` uses Oxfmt defaults across maintained repo files, without
Tailwind class sorting. Run `pnpm format` for the whole repo or
`pnpm exec vp fmt apps/portal` for only the portal. Generated files are
excluded. For targeted lint and native type diagnostics, run
`pnpm --filter @pms/portal check` from the repository root. The portal's
`vite.config.ts` owns its React rules and browser/Node environments, reusing
`tooling/lint.ts` for common defaults. Browser globals apply to portal source and
tests. `pnpm --filter @pms/portal build` checks only the portal before bundling it.

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
platforms not tested for each release; this implementation has not been
validated on physical devices by this change.
