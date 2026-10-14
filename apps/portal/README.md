# Portal

The portal is a Vite SPA deployed as static assets on the `pms-portal`
Cloudflare Worker.

Run it locally from the repository root:

```sh
pnpm dev:portal
```

The portal reads its API URL from `VITE_API_BASE_URL`, which Vite inlines at
build time. `.env.development` sets it to `http://127.0.0.1:8788`, the port the
backend dev script uses. Override it in `.env.local`. A build fails if the
variable is missing.

## Reservation forms

The reservation editor uses TanStack Form with portal-local Zod 4 schemas in
`src/lib/reservation-form-schemas.ts`. Details, guest add/edit, payment add/edit,
discount, and cancellation have independent form instances. API writes still use
TanStack Query and workflow commands with retry-safe request IDs.

Validation runs on blur and on submit, then on change after a submission attempt.
Room counts and capacity validate on change because they control billing previews.
Known server validation errors appear beside fields; other write failures use
error toasts. Query failures stay beside the content they block.

Run `pnpm test` from the repository root (backend then portal), or
`pnpm --filter @pms/portal test` for the portal alone. Schema and workflow
tests use Node's test runner and do not need a browser.

## Deployment

Production portal: `https://pms-portal.meldar.workers.dev`
