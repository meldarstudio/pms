# Portal agent instructions

Paths below are relative to `apps/portal` unless stated otherwise.
Before portal tests or compiler changes, read the [reservation-form testing guidance](README.md#reservation-forms).
Run test commands sequentially, targeting affected files first. Ask before raising
worker or heap limits; follow the root [frontend testing policy](../../CODING_STANDARDS.md#frontend-scope).

## Navigation and data

- Code-based TanStack Router routes live in `src/router.tsx`; `src/App.tsx` owns the shell and `src/components/app-sidebar.tsx` owns navigation. Read [navigation](README.md#navigation) before changing the shell or sidebar. Both the calendar and Reservations list open `ReservationPage` for an existing reservation. `RoomBookingDialog` handles creation from the calendar.
- Fetch helpers and response types are hand-written in `src/lib/api.ts`; query hooks live in `src/lib/queries.ts`. The portal does not depend on `@pms/shared`.
- Before changing reservation forms, validation, billing previews, or save/error behavior, read [reservation forms](README.md#reservation-forms). Portal-local schemas live in `src/lib/reservation-form-schemas.ts`.
- Before changing setup routing or editors, read [property setup](README.md#property-setup), including readiness, draft preservation, and navigation guards.
- Before changing `AuthGate`, session queries, or fetch error handling, read [signing in](README.md#signing-in), including credentialed requests and cache clearing on 401.

## API environment

- Before starting the portal or changing API origins/environment files, read the [portal environment setup](README.md) and [root build commands](../../README.md#commands) for `VITE_API_BASE_URL`, build-time configuration, and same-site localhost cookies. There is no Vite proxy.
- Credentialed CORS uses exact origins from the backend's `ALLOWED_ORIGINS`; local overrides belong in the backend's `.dev.vars`.

## UI conventions

- Keep type-only imports as `import type` or inline `type` imports.
- Follow `components.json` and existing `src/components/ui` primitives when composing shadcn UI. Import `cn` from `"cn"`, rather than the generated utils alias.
- Add shadcn components from `apps/portal` with `pnpm exec shadcn add <name>`.
