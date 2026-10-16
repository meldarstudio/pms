# Portal

The portal is a Vite+ SPA deployed as static assets on the `pms-portal`
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

Run `pnpm exec vp test` from the repository root for both test projects,
`pnpm test` to run backend then portal, or `pnpm --filter @pms/portal test`
for the portal alone. Tests use `vite-plus/test` and do not need a browser.
The dialog suite uses happy-dom and a Vite SSR server to render the actual
components.

Run `pnpm check` for Oxfmt, Oxlint, and native type checks across the portal,
backend, and shared schemas. `pnpm --filter @pms/portal typecheck` runs only native type
checks for portal source, Vite configuration, and tests. The solution tsconfig
references `tsconfig.app.json`, `tsconfig.node.json`, and `tests/tsconfig.json`.
The test config inherits the app's strict options and adds Node types. The
dialog harness uses happy-dom types, with a DOM type conversion at React's
`createRoot` boundary and module assertions for Vite's dynamic SSR loader.

The portal and backend use the same TypeScript 7 catalog dependency from
`pnpm-workspace.yaml`. Vite+'s checker also uses TypeScript 7. For a standalone
compiler check, run `pnpm --filter @pms/portal exec tsc -b`. `pnpm build` runs
native checking before bundling without a duplicate compiler check.

The root `vite.config.ts` uses Oxfmt defaults across maintained repo files, with Tailwind
class sorting for portal TS/TSX files. Run `pnpm format` for the whole repo or
`pnpm --filter @pms/portal format` for only the portal. Generated files are
excluded. `pnpm lint` covers all three packages. Use
`pnpm --filter @pms/portal lint` for portal TS/TSX files only. React Hooks rules
remain portal-only, and browser globals apply to portal source and tests.

## Deployment

Production portal: `https://pms-portal.meldar.workers.dev`
