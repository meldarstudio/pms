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
treats the portal and API as the same site and sends the session cookie. Override it in `.env.local`. A build fails if the
variable is missing.

## Property setup

After signing in, a hotel without rooms is directed to `/setup`. The
**Configuración** tab keeps the page accessible afterward. Each deployment manages
one property; there is no hotel profile or account-creation step.

The room-type list opens an editor for the type's name, base nightly rate in PEN,
maximum occupancy, and a table of its physical room numbers. **Agregar habitación**
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

Base-rate changes leave saved reservation prices intact. Lower occupancy limits
retain unchanged reservations; subsequent changes use the current validation rules.
Room reassignment and dated rate overrides stay in their existing screens.

`tests/setup.test.ts` exercises the real page and router through happy-dom with
HTTP responses substituted at the fetch boundary. The backend setup tests cover
the actual API and transactional database behavior.

## Reservation forms

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
The dialog suite in `tests/reservation-dialog.test.ts` uses happy-dom and a Vite
SSR server with an explicit portal root to render the actual components.

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

## Deployment

Production portal: `https://app.hotelmanantialchurin.com`
