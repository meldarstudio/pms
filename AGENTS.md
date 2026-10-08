# AGENTS.md

pnpm workspace. `packageManager` is `pnpm@11.22.0`. Do not use npm or npx for project commands. `zod` is a catalog dependency (`"zod": "catalog:"`). The app READMEs still say npm. Ignore them.

## Packages

- `@pms/portal` in `apps/portal` is the Vite React SPA. There is no router. Tabs live in `src/App.tsx`. Dashboard and Reservations are empty placeholders. Fetch helpers and response types are hand-written in `src/lib/api.ts`. TanStack Query hooks are in `src/lib/queries.ts`. It does not depend on `@pms/shared`.
- `@pms/backend` in `apps/backend` is the Hono Worker. Entry is `src/index.ts`. D1 binding is `DB`; local, production, and Preview databases are `pms`, `pms-production`, and `pms-preview`. Request schemas come from `@pms/shared`. Routes call `validate()` and throw `HttpError` with status 400, 404, or 409. Error JSON is `{ error: string }`. The app uses `Env` from `src/env.ts`.
- `@pms/shared` in `packages/shared` is Zod schemas only. It exports `./src/index.ts` and has no build or typecheck script.

## Commands

Run these from the repo root.

- `pnpm dev` starts portal and backend. `pnpm dev:portal` and `pnpm dev:backend` start one.
- `pnpm test` runs backend Vitest only. Tests are colocated under `apps/backend/src`. The portal has a separate Node test script: `pnpm --filter @pms/portal test`.
- `pnpm lint` is portal ESLint only. Format the portal with `pnpm --filter @pms/portal format`.
- `pnpm typecheck` runs each package that defines `typecheck`. Shared does not.
- After a schema edit in `apps/backend/src/db/schema.ts`, run `pnpm db:generate`, then `pnpm db:migrate:local`. First local data load is `pnpm db:seed:local` (`apps/backend/seed.sql` uses `INSERT OR IGNORE`).
- Refresh Worker types with `pnpm --filter @pms/backend cf-typegen`. Do not edit `apps/backend/worker-configuration.d.ts`.
- Deploy is not a root script. Use `pnpm --filter @pms/backend deploy`.

## Local API

The Vite proxy sends `/api` to `http://127.0.0.1:8788` and strips the `/api` prefix. The portal client tries `http://127.0.0.1:8788`, then `http://127.0.0.1:8787`, then `/api`, and keeps the first base whose `GET /` returns `{ name: "pms" }`. `wrangler dev` defaults to port 8787, so the proxy misses it unless you pass `--port 8788`. CORS allows local origins and `pms-portal` production or Preview Workers under the `meldar` workers.dev account.

## Domain

- Dates are `YYYY-MM-DD` UTC calendar dates. Stay nights are `[checkIn, checkOut)`. A checkout morning is free for the next arrival. Rate ranges include both ends. A stay cannot exceed 60 nights.
- Money is integer cents. A night price is the flat rate, else that date's override, else `baseRateCents`.
- Rooms have no operational status. Dated room closures are the only way to block a room and reduce room-type availability. Closures cannot overlap assigned stays or other closures.
- Capacity, overlap, and assignment conflicts are SQLite triggers in `apps/backend/drizzle/0001_overlap_triggers.sql`. That file is hand-written and listed in `drizzle/meta/_journal.json`. `rethrowConflict` maps the trigger abort text to 409. Do not delete or regenerate `0001_overlap_triggers.sql` when running `db:generate`. `0000_high_sunset_bain.sql` is the drizzle-kit migration.

## Portal style

- Backend and shared use single quotes and no semicolons. They have no Prettier config. Portal TypeScript is 6. Backend TypeScript is 7. Do not align them.
- Portal Prettier is `apps/portal/.prettierrc`. Double quotes, no semicolons, print width 80, Tailwind plugin.
- Portal `tsconfig.app.json` enables `verbatimModuleSyntax`, `erasableSyntaxOnly`, and `noUnusedLocals`. Use `import type` or inline `type` imports.
- shadcn is already set up in `apps/portal`. `components.json` style is `base-lyra`. Primitives come from `@base-ui/react`, not Radix. Icons are `lucide-react`. Aliases use `@/`. UI files import `cn` from `"cn"`, not from `@/lib/utils`. Add a component from `apps/portal` with `pnpm exec shadcn add <name>`. Do not use `npx shadcn`.
