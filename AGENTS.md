# AGENTS.md

pnpm workspace. `packageManager` is `pnpm@11.22.0`. Do not use npm or npx for project commands. `zod` is a catalog dependency (`"zod": "catalog:"`). The app READMEs still say npm. Ignore them.

## Local data and schema changes

All current application data is local sample data. There is no real customer or business data to preserve.

- Prefer deleting and rebuilding the local schema, then reseeding, over writing data-preserving upgrade migrations. Do not retain legacy tables, columns, compatibility code, or backfills just to preserve sample data.
- Agents are authorized to drop and recreate local application tables or the local database as part of development, without asking for confirmation or making backups.
- Generated migration SQL, snapshots, and the Drizzle journal are disposable build artifacts. Delete and regenerate them instead of reading or manually editing their history. Use `schema.ts`, application code, and tests to understand the current model; inspect generated artifacts only to diagnose a specific generation or database error.
- Keep a runnable fresh baseline. Set aside hand-written trigger SQL, delete `drizzle/`, run `pnpm db:generate`, then restore the triggers and register their migration in the new journal programmatically. Do not spend tokens reviewing snapshot JSON or superseded migrations.
- Preserve the current business-rule triggers when rebuilding the schema. Update seeds, tests, and documentation to match the resulting schema.
- Use `pnpm db:reset:local --rebuild-schema` to replace local tables, triggers, and migration history and reload sample data. Use `pnpm db:reset:local` when only the sample data needs resetting.
- This policy applies to local development. Remote database changes follow the branch and deployment workflow below.

## Packages

- `@pms/portal` in `apps/portal` is the Vite React SPA. There is no router. Tabs live in `src/App.tsx`. Calendar bookings open quick edit; the Reservations list opens the full reservation page. Fetch helpers and response types are hand-written in `src/lib/api.ts`. TanStack Query hooks are in `src/lib/queries.ts`. It does not depend on `@pms/shared`.
- `@pms/backend` in `apps/backend` is the Hono Worker. Entry is `src/index.ts`. D1 binding is `DB`. `DB --local` and `wrangler dev` use `preview_database_id` (`pms-preview`). Production remote uses `pms-production`. Request schemas come from `@pms/shared`. Routes call `validate()` and throw `HttpError` with status 400, 404, or 409. Error JSON is `{ error: string }`. The app uses `Env` from `src/env.ts`.
- `@pms/shared` in `packages/shared` is Zod schemas only. It exports `./src/index.ts` and has no build or typecheck script.

## Commands

Run these from the repo root.

- `pnpm dev` starts portal and backend. `pnpm dev:portal` and `pnpm dev:backend` start one.
- `pnpm test` runs backend Vitest only. Tests are colocated under `apps/backend/src`. The portal has a separate Node test script: `pnpm --filter @pms/portal test`.
- `pnpm lint` is portal ESLint only. Format the portal with `pnpm --filter @pms/portal format`.
- `pnpm typecheck` runs each package that defines `typecheck`. Shared does not.
- After a schema edit in `apps/backend/src/db/schema.ts`, regenerate the baseline as described above, then run `pnpm db:reset:local --rebuild-schema`. `pnpm db:migrate:local` applies the current migration files without resetting data. `pnpm db:seed:local` only adds missing room types and rooms (`apps/backend/seed.sql` uses `INSERT OR IGNORE`).
- Refresh Worker types with `pnpm --filter @pms/backend cf-typegen`. Do not edit `apps/backend/worker-configuration.d.ts`.
- Deploy is not a root script. Use `pnpm --filter @pms/backend deploy`.

## Branch and deployment workflow

- Feature PRs, including portal and backend changes, target `staging`. Merge `staging` into `main` through a PR when the combined changes are ready for production.
- The `staging` branch deploys the stable `staging-pms-api` endpoint against `pms-preview`; the production `main` branch deploys `pms-api` against `pms-production`.
- The portal's non-main builds use `https://staging-pms-api.meldar.workers.dev`; production builds use `https://pms-api.meldar.workers.dev`. `VITE_API_BASE_URL` is a Workers Builds build variable, inlined at build time.
- Prepare the target database schema before deploying code that requires it: rebuild and seed local databases, and apply the matching schema to `pms-preview` for staging or `pms-production` when releasing to production. A consolidated baseline requires rebuilding or replacing an older database, not applying it over existing tables. Do not change the production database as part of a feature PR.
- Since `staging` is the integration environment, backend changes needed by portal changes should be merged to `staging` before testing the combined app there. Merge or fast-forward `main` back into `staging` after production-only hotfixes.

## Local API

The portal reads its API origin from `VITE_API_BASE_URL`, inlined at build time. `apps/portal/.env.development` sets it to `http://127.0.0.1:8788` for `pnpm dev`, which matches the backend `dev` script (`wrangler dev --port 8788`). Override it in `.env.local`. `vite build` and the module itself fail if it is unset. On Cloudflare, set it as a Workers Builds build variable (production `https://pms-api.meldar.workers.dev`, other branches `https://staging-pms-api.meldar.workers.dev`), not a runtime variable. There is no Vite proxy. CORS allows local origins and `pms-portal` production or Preview Workers under the `meldar` workers.dev account.

## Domain

- Dates are `YYYY-MM-DD` UTC calendar dates. Stay nights are `[checkIn, checkOut)`. A checkout morning is free for the next arrival. Rate ranges include both ends. A stay cannot exceed 60 nights.
- Money is integer cents. A night price is the flat rate, else that date's override, else `baseRateCents`.
- Rooms have no operational status. Dated room closures are the only way to block a room and reduce room-type availability. Closures cannot overlap assigned stays or other closures.
- Capacity, overlap, and assignment conflicts are SQLite triggers in `apps/backend/drizzle/0001_overlap_triggers.sql`. That file is hand-written and listed in `drizzle/meta/_journal.json`. `rethrowConflict` maps the trigger abort text to 409. Drizzle does not generate these guards; preserve and adapt them when consolidating migrations. `0000_schema.sql` is the current drizzle-kit baseline.

## Portal style

- Backend and shared use single quotes and no semicolons. They have no Prettier config. Portal TypeScript is 6. Backend TypeScript is 7. Do not align them.
- Portal Prettier is `apps/portal/.prettierrc`. Double quotes, no semicolons, print width 80, Tailwind plugin.
- Portal `tsconfig.app.json` enables `verbatimModuleSyntax`, `erasableSyntaxOnly`, and `noUnusedLocals`. Use `import type` or inline `type` imports.
- shadcn is already set up in `apps/portal`. `components.json` style is `base-lyra`. Primitives come from `@base-ui/react`, not Radix. Icons are `lucide-react`. Aliases use `@/`. UI files import `cn` from `"cn"`, not from `@/lib/utils`. Add a component from `apps/portal` with `pnpm exec shadcn add <name>`. Do not use `npx shadcn`.
