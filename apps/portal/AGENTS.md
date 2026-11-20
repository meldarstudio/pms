# Portal agent instructions

Paths below are relative to `apps/portal` unless stated otherwise.
Run test commands sequentially, targeting affected files first. Ask before raising
worker or heap limits; follow the root [frontend testing policy](../../CODING_STANDARDS.md#frontend-scope).

## Navigation and data

- Code-based TanStack Router routes live in `src/router.tsx`; `src/App.tsx` owns the shell and `src/components/app-sidebar.tsx` owns navigation. Calendar bars open the reservation's `ReservationPage`, the editing workspace; calendar room assignment stays in its existing flow. On that page, an assigned room number opens a same-type replacement picker, and a room's guest count opens adult and child steppers; each writes one `edit-room` only after confirmation, carrying the reserved room it showed as `expected`. `RoomBookingDialog` handles creation only; successful creation from either entry point opens the new reservation page. Calendar-origin pages return to the calendar's range and scroll position.
- Fetch helpers, response types, and query-string types are hand-written in `src/lib/api.ts`, which re-exports request body types from `@pms/shared`; query hooks live in `src/lib/queries.ts`. Saves and bill previews for an existing reservation go through `src/lib/reservation-commands.ts`. Import only types from `@pms/shared`, using `import type`; the runtime exception is `@pms/shared/phone`. `src/lib/phone.ts` adds the saved-phone draft and Spanish messages; pass its `phoneInputText` to `editPhone` so an unchanged saved phone keeps its original text.
- Portal-local reservation schemas live in `src/lib/reservation-form-schemas.ts`.

## API environment

- Builds need `VITE_API_BASE_URL` at build time. There is no Vite proxy. Use `localhost` for both apps; mixing it with `127.0.0.1` drops session cookies.
- Credentialed CORS uses exact origins from the backend's `ALLOWED_ORIGINS`; local overrides belong in the backend's `.dev.vars`.

## UI conventions

- Keep type-only imports as `import type` or inline `type` imports.
- Follow `components.json` and existing `src/components/ui` primitives when composing shadcn UI. Import `cn` from `"cn"`, rather than the generated utils alias.
- Add shadcn components from `apps/portal` with `pnpm exec shadcn add <name>`.

## Test environment

The shared happy-dom/Vite SSR harness renders real screens and forms, substituting
HTTP responses at fetch; no browser is needed. Reuse the existing suites under
`tests/`, including `reservation-dialog.test.ts` and `reservation-page.test.ts`.
These tests do not establish visual or physical-device correctness.
Every suite runs in one worker and shares one happy-dom window and Vite server
(`isolate: false`, `sharedBrowserTest` in `tests/browser.ts`), so module state outlives
a file: restore timers, globals, `process.env`, and the viewport in `afterEach` or `afterAll`.
