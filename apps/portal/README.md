# Portal

React SPA built with Vite+ and deployed as Cloudflare Worker static assets.
Start with root [setup](../../README.md#setup), [sign-in](../../README.md#signing-in),
and [commands](../../README.md#commands). Read [portal agent instructions](AGENTS.md)
before changes.

## Guides

- [Portal shell and installed app](../../docs/portal.md) for shared Lyra control styling, navigation, error and loading states, API environment, offline behavior, and update checks.
- [Authentication](../../docs/authentication.md#portal-sessions) for AuthGate, credentialed requests, and cache clearing.
- [Property calendar](../../docs/property-calendar.md) for operational today, date pickers, and session metadata.
- [Reservations](../../docs/reservations.md#portal-editors) for creation, compact/full-page editing, drafts, lifecycle actions, and list filters.
- [Calendar and assignment](../../docs/calendar.md) for backlog boundaries, assignment flow, and assignment availability rules.
- [Property setup and configuration](../../docs/property-setup.md#portal-setup) for readiness, room-type drafts, appearance, and account navigation.
- [Housekeeping](../../docs/housekeeping.md) for the Limpieza page, the calendar marker, and the dirty-room check-in warning.
- [Production releases](../../docs/releases.md) for delivering compatible API and portal versions.

## Implementation and tests

`src/lib/api.ts` owns hand-written API types and fetch helpers; query hooks live in
`src/lib/queries.ts`. Edits to an existing reservation, including room assignment and
bill previews, go through `src/lib/reservation-commands.ts`; see
[the Reservation command module](../../docs/reservations.md#reservation-command-module). The portal maintains local schemas and does not import
`@pms/shared`. UI primitives follow `components.json`; import `cn` from `"cn"`.

The shared happy-dom/Vite SSR harness renders real screens and forms with HTTP
responses substituted at fetch. Dialog and page suites live in
`tests/reservation-dialog.test.ts` and `tests/reservation-page.test.ts`. These
tests need no browser and do not establish visual/device correctness. Follow the
root [testing guidance](../../README.md#testing) and
[frontend policy](../../CODING_STANDARDS.md#frontend-scope).
