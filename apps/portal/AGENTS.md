# Portal agent instructions

Paths below are relative to `apps/portal` unless stated otherwise.
Before portal tests or compiler changes, read the [reservation editor guidance](../../docs/reservations.md#portal-editors) and [test environment](README.md#implementation-and-tests).
Run test commands sequentially, targeting affected files first. Ask before raising
worker or heap limits; follow the root [frontend testing policy](../../CODING_STANDARDS.md#frontend-scope).

## Navigation and data

- Code-based TanStack Router routes live in `src/router.tsx`; `src/App.tsx` owns the shell and `src/components/app-sidebar.tsx` owns navigation. Read [navigation](../../docs/portal.md#navigation) before changing the shell or sidebar. Calendar bars open `RoomBookingDialog` in edit mode; the Reservations list and the dialog's **Ver reserva completa** action open `ReservationPage`. `RoomBookingDialog` also handles creation.
- Fetch helpers and response types are hand-written in `src/lib/api.ts`; query hooks live in `src/lib/queries.ts`. The portal does not depend on `@pms/shared`.
- Before changing reservation forms, validation, billing previews, or save/error behavior, read [reservation editors](../../docs/reservations.md#portal-editors). Portal-local schemas live in `src/lib/reservation-form-schemas.ts`.
- Before changing setup routing or editors, read [property setup](../../docs/property-setup.md#portal-setup), including readiness, draft preservation, and navigation guards.
- Before changing `AuthGate`, session queries, or fetch error handling, read [portal sessions](../../docs/authentication.md#portal-sessions), including credentialed requests and cache clearing on 401.
- Before changing how a page shows load failures, stale data, retries, or render crashes, read [error states](../../docs/portal.md#error-states).
- Before changing what a page shows while its data loads, read [loading states](../../docs/portal.md#loading-states).

## API environment

- Before starting the portal or changing API origins/environment files, read the [portal environment setup](../../docs/portal.md#api-environment) and [root build commands](../../README.md#commands) for `VITE_API_BASE_URL`, build-time configuration, and same-site localhost cookies. There is no Vite proxy.
- Credentialed CORS uses exact origins from the backend's `ALLOWED_ORIGINS`; local overrides belong in the backend's `.dev.vars`.

## Calendar and assignment

Before changing calendar reads, caching, or assignment, read [the calendar guide](../../docs/calendar.md), including the known checked-in assignment limitation, and [ADR 0001](../../docs/adr/0001-calendar-is-one-read.md).

## UI conventions

- Keep type-only imports as `import type` or inline `type` imports.
- Follow `components.json` and existing `src/components/ui` primitives when composing shadcn UI. Import `cn` from `"cn"`, rather than the generated utils alias.
- Add shadcn components from `apps/portal` with `pnpm exec shadcn add <name>`.
