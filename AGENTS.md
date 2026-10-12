# AGENTS.md

pnpm workspace. `packageManager` is `pnpm@11.22.0`. Do not use npm or npx for project commands. `zod` is a catalog dependency, `"zod": "catalog:"`, and the catalog is Zod 4. Do not write Zod 3 APIs.

## Local data and schema changes

All current application data is local sample data. There is no real customer or business data to preserve.

- Prefer deleting and rebuilding the local schema, then reseeding, over writing data-preserving upgrade migrations. Do not retain legacy tables, columns, compatibility code, or backfills just to preserve sample data.
- Agents are authorized to drop and recreate local application tables or the local database as part of development, without asking for confirmation or making backups.
- Generated migration SQL, snapshots, and the Drizzle journal are disposable build artifacts. Delete and regenerate them instead of reading or manually editing their history. Use `schema.ts`, application code, and tests to understand the current model. Inspect generated artifacts only to diagnose a specific generation or database error.
- Keep a runnable fresh baseline. Set aside `apps/backend/drizzle/0001_overlap_triggers.sql`, delete `apps/backend/drizzle/`, run `pnpm db:generate`, then restore the trigger file and register it in `drizzle/meta/_journal.json`. Do not read or hand-edit snapshot JSON. Separate statements in the trigger file with `--> statement-breakpoint`, or Wrangler will not apply them as separate statements.
- Preserve the current business-rule triggers when rebuilding the schema. Update seeds, tests, and documentation to match the resulting schema.
- `pnpm db:reset:local` applies local migrations, deletes local application data, and reloads sample data. It leaves the schema, triggers, and migration history in place. `pnpm db:reset:local --rebuild-schema` also drops PMS tables, triggers, and the D1 migration ledger, then applies the current baseline. `--date=YYYY-MM-DD` pins sample dates. The default anchor is today in UTC. `--persist-to` must be the same directory passed to Wrangler, or the backend reads a different database.
- `pnpm db:migrate:local` applies the current migration files without resetting data. `pnpm db:seed:local` only adds missing room types and rooms. `apps/backend/seed.sql` uses `INSERT OR IGNORE`.
- This policy is local only. Do not run `pnpm --filter @pms/backend db:reset:preview` or `pnpm --filter @pms/backend deploy` unless the task is a remote preview reset or a production release. `db:reset:preview` wipes the shared `pms-preview` database. `deploy` applies migrations to `pms-production` before `wrangler deploy`.

## Packages

- `@pms/portal` in `apps/portal` is the Vite React SPA. There is no router. Tabs live in `src/App.tsx`. A calendar booking opens `RoomBookingDialog`. The Reservations list opens `ReservationPage`. Fetch helpers and response types are hand-written in `src/lib/api.ts`. TanStack Query hooks are in `src/lib/queries.ts`. The portal does not depend on `@pms/shared`.
- `@pms/backend` in `apps/backend` is the Hono Worker. Entry is `src/index.ts`. D1 binding is `DB`. `pnpm dev:backend` is `wrangler dev --port 8788` and uses the local D1 database, the same one as `pnpm db:reset:local`. It does not use `pms-preview`. Remote production is `pms-production`. Preview Workers bind `DB` to `pms-preview`. Request schemas come from `@pms/shared`. Routes call `validate` and throw `HttpError` with status 400, 404, or 409. Error JSON is `{ error: string }`. The app uses `Env` from `src/env.ts`.
- Reservation creates and edits are workflow commands, not field patches. `POST /reservations` uses `workflowCreateSchema`. `POST /reservations/:id/commands` writes, and `POST /reservations/:id/preview` calculates the same actions. `requestId` deduplicates retries. Reusing an ID with a different payload returns 409. The write batch sets the reservation to `cancelled` inside the transaction so a room swap does not trip overlap triggers, then writes the final status. Do not remove that release step.
- Backend error strings stay English. Add the same string to `apps/portal/src/lib/errors.ts`, or the portal shows the raw message. `rethrowConflict` maps trigger abort text to those strings.
- `@pms/shared` in `packages/shared` is Zod schemas only. It exports `./src/index.ts` and has no build or typecheck script.

## Commands

Run these from the repo root.

- `pnpm dev` starts portal and backend. `pnpm dev:portal` and `pnpm dev:backend` start one.
- `pnpm test` runs backend Vitest only. Tests are colocated under `apps/backend/src`, including `.test.mjs`. They apply `apps/backend/drizzle` SQL to `node:sqlite`. They do not need a running Worker. One file: `pnpm --filter @pms/backend test -- src/routes/reservations.test.ts`.
- Portal tests use Node's test runner, not Vitest. `pnpm --filter @pms/portal test` runs `apps/portal/tests`. One file: `pnpm --filter @pms/portal exec node --experimental-strip-types --test tests/form-validation.test.ts`. Those tests import `../src/**/*.ts`. `tsconfig.app.json` does not include them.
- `pnpm lint` is portal ESLint only. Format the portal with `pnpm --filter @pms/portal format`. Backend and shared have no formatter or lint script.
- `pnpm typecheck` runs each package that defines `typecheck`. Shared does not. Backend `tsc --noEmit` checks backend sources. Portal `typecheck` checks nothing, because `apps/portal/tsconfig.json` sets `"files": []`. Typecheck the portal with `pnpm --filter @pms/portal exec tsc -b`.
- After a schema edit in `apps/backend/src/db/schema.ts`, regenerate the baseline as described above, then run `pnpm db:reset:local --rebuild-schema`.
- Refresh Worker types with `pnpm --filter @pms/backend cf-typegen`. Do not edit `apps/backend/worker-configuration.d.ts`.
- `pnpm --filter @pms/backend deploy` migrates `pms-production`, then deploys `pms-api`. `deploy:ci` and `deploy:preview:ci` deploy code and do not change either database. `db:migrate:remote` targets `pms-production`. `db:migrate:preview` targets `pms-preview` through `wrangler.preview-migrations.jsonc`.

## Branch and deployment workflow

- Feature PRs, including portal and backend changes, target `staging`. Merge `staging` into `main` through a PR when the combined changes are ready for production.
- The `staging` branch deploys the stable `staging-pms-api` endpoint against `pms-preview`. The production `main` branch deploys `pms-api` against `pms-production`.
- The portal's non-main builds use `https://staging-pms-api.meldar.workers.dev`. Production builds use `https://pms-api.meldar.workers.dev`. `VITE_API_BASE_URL` is a Workers Builds build variable, inlined at build time.
- Prepare the target database schema before deploying code that requires it. Rebuild and seed local databases. Apply the matching schema to `pms-preview` for staging, or to `pms-production` when releasing to production. A consolidated baseline requires rebuilding or replacing an older database, not applying it over existing tables. Do not change the production database as part of a feature PR. After a baseline change, run `pnpm --filter @pms/backend db:reset:preview --rebuild-schema` before deploying the matching backend.
- Since `staging` is the integration environment, backend changes needed by portal changes should be merged to `staging` before testing the combined app there. Merge or fast-forward `main` back into `staging` after production-only hotfixes.

## Local API

The portal reads its API origin from `VITE_API_BASE_URL`, inlined at build time. `apps/portal/.env.development` sets it to `http://127.0.0.1:8788`, which matches `wrangler dev --port 8788`. Override it in `.env.local`. `vite build` and `src/lib/api.ts` fail if it is unset. On Cloudflare, set it as a Workers Builds build variable, not a runtime variable. There is no Vite proxy. CORS allows local origins and `pms-portal` production or Preview Workers under the `meldar` workers.dev account.

## Domain

- Dates are `YYYY-MM-DD` UTC calendar dates. A reservation has one `checkIn` and one `checkOut` for every room. Stay nights and room closures are `[start, end)`. A checkout morning is free for the next arrival. Rate ranges include both ends. A stay cannot exceed 60 nights.
- Check-in and checkout change status only. There are no arrival or departure timestamp columns. For an early departure, save the shorter date range together with `checked_out`.
- Guests use `fullName`, not separate first and last names.
- `confirmed`, `checked_in`, and `checked_out` hold inventory. `cancelled` and `no_show` do not. `cancelled` drops room charges from the bill and can leave a credit. Check-in requires every room to be assigned.
- Money is integer cents. Currency is `PEN` from the Worker `CURRENCY` var. A night price is the flat rate, else that date's override, else `baseRateCents`. Retained nights keep their saved prices. Added nights use current rates. Changing room type reprices that room.
- Rooms have no operational status. Dated room closures are the only way to block a room and reduce room-type availability. Closures cannot overlap assigned stays or other closures.
- Capacity, overlap, assignment, and staying-guest conflicts are SQLite triggers in `apps/backend/drizzle/0001_overlap_triggers.sql`. That file is hand-written and listed in `drizzle/meta/_journal.json`. `rethrowConflict` maps the trigger abort text to 409. Drizzle does not generate these guards. `0000_schema.sql` is the current drizzle-kit baseline. Tests execute every journal entry, so an unregistered trigger file does not run in tests.

## Portal style

- Backend and shared use single quotes and no semicolons. They have no Prettier config. Portal TypeScript is 6. Backend TypeScript is 7. Do not align them.
- Portal Prettier is `apps/portal/.prettierrc`. Double quotes, no semicolons, print width 80, Tailwind plugin.
- Portal `tsconfig.app.json` enables `verbatimModuleSyntax`, `erasableSyntaxOnly`, and `noUnusedLocals`. Use `import type` or inline `type` imports.
- shadcn is already set up in `apps/portal`. `components.json` style is `base-lyra`. Primitives come from `@base-ui/react`, not Radix. Icons are `lucide-react`. Aliases use `@/`. UI files import `cn` from `"cn"`, not from `@/lib/utils`. Add a component from `apps/portal` with `pnpm exec shadcn add <name>`. Do not use `npx shadcn`.
