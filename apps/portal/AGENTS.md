# Portal agent instructions

Paths below are relative to `apps/portal` unless stated otherwise.
Read [README.md](README.md) before portal development or tests; it documents the real-component happy-dom harnesses.

## Navigation and data

- Code-based TanStack Router routes live in `src/router.tsx`; tabs live in `src/App.tsx`. Both the calendar and Reservations list open `ReservationPage` for an existing reservation. `RoomBookingDialog` handles creation from the calendar.
- Fetch helpers and response types are hand-written in `src/lib/api.ts`; query hooks live in `src/lib/queries.ts`. The portal does not depend on `@pms/shared`.
- Reservation forms use TanStack Form with portal-local Zod 4 schemas in `src/lib/reservation-form-schemas.ts`. Read [reservation forms](README.md#reservation-forms) before changing validation, billing previews, or save/error behavior. Keep workflow writes retry-safe with request IDs.
- Before changing setup routing or editors, read [property setup](README.md#property-setup). An empty property goes to `/setup`; readiness comes from saved rooms, not a separate completion flag. Preserve unsaved drafts and navigation guards.
- `AuthGate` wraps the router. Requests send `credentials: "include"`; a 401 clears cached data and returns to login while retaining the current URL. See [signing in](README.md#signing-in).

## API environment

- `VITE_API_BASE_URL` is required and inlined at build time. Development reads `.env.development`; local overrides go in `.env.local`. Production Workers Builds needs a build variable, not a runtime variable. See [root build commands](../../README.md#commands).
- Use `http://localhost:8788` for the local API with `http://localhost:5173` for the portal. Mixing `localhost` and `127.0.0.1` prevents same-site session cookies. There is no Vite proxy.
- Credentialed CORS uses exact origins from the backend's `ALLOWED_ORIGINS`; local overrides belong in the backend's `.dev.vars`.

## UI conventions

- Keep type-only imports as `import type` or inline `type` imports; the app enables `verbatimModuleSyntax`, `erasableSyntaxOnly`, and `noUnusedLocals`.
- shadcn uses `base-lyra`, Base UI (`@base-ui/react`), and `lucide-react` icons. Use `@/` aliases and import `cn` from `"cn"`.
- Add shadcn components from `apps/portal` with `pnpm exec shadcn add <name>`.
