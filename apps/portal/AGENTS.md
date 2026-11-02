# Portal agent instructions

Paths below are relative to `apps/portal` unless stated otherwise.
Run test commands sequentially, targeting affected files first. Ask before raising
worker or heap limits; follow the root [frontend testing policy](../../CODING_STANDARDS.md#frontend-scope).

## Navigation and data

- Code-based TanStack Router routes live in `src/router.tsx`; `src/App.tsx` owns the shell and `src/components/app-sidebar.tsx` owns navigation. Calendar bars open `RoomBookingDialog` in edit mode; the Reservations list and the dialog's **Ver reserva completa** action open `ReservationPage`. `RoomBookingDialog` also handles creation.
- Fetch helpers and response types are hand-written in `src/lib/api.ts`; query hooks live in `src/lib/queries.ts`. Saves and bill previews for an existing reservation go through `src/lib/reservation-commands.ts`. The portal does not depend on `@pms/shared`.
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
