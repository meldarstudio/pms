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
- This policy is local only. Do not run `pnpm --filter @pms/backend deploy` unless the task is a production release. `deploy` applies migrations to `pms-production` before `wrangler deploy`.

## Packages

- `@pms/portal` in `apps/portal` is the Vite React SPA using code-based TanStack Router routes in `src/router.tsx`. Tabs live in `src/App.tsx`. A calendar booking opens `RoomBookingDialog`. The Reservations list opens `ReservationPage`. Fetch helpers and response types are hand-written in `src/lib/api.ts`. TanStack Query hooks are in `src/lib/queries.ts`. The portal does not depend on `@pms/shared`.
- `@pms/backend` in `apps/backend` is the Hono Worker. Entry is `src/index.ts`. D1 binding is `DB`. `pnpm dev:backend` is `wrangler dev --port 8788` and uses the local D1 database, the same one as `pnpm db:reset:local`. Remote production is `pms-production`. Request schemas come from `@pms/shared`. Routes call `validate` and throw `HttpError` with status 400, 404, or 409. Error JSON is `{ error: string }`. The app uses `Env` from `src/env.ts`.
- Reservation creates and edits are workflow commands, not field patches. `POST /reservations` uses `workflowCreateSchema`. `POST /reservations/:id/commands` writes, and `POST /reservations/:id/preview` calculates the same actions and returns `{ billing, validation: { issues } }`. Priceable drafts return 200 even when operational issues prevent saving. Issues identify the affected field and its index in the proposed rooms, excluding removed rooms. Invalid pricing inputs still return an HTTP error. `requestId` deduplicates retries. Reusing an ID with a different payload returns 409. The write batch sets the reservation to `cancelled` inside the transaction so a room swap does not trip overlap triggers, then writes the final status. Do not remove that release step.
- Backend error strings stay English. Add the same string to `apps/portal/src/lib/errors.ts`, or the portal shows the raw message. `rethrowConflict` maps trigger abort text to those strings.
- `@pms/shared` in `packages/shared` is Zod schemas only. It exports `./src/index.ts` and has no build or typecheck script.

## Commands

Run these from the repo root.

- Use Node 22.22.1 from `.node-version` and pnpm 11.22.0. Vite+ is installed locally; run it with `pnpm exec vp`. `pnpm dev` starts portal and backend. `pnpm dev:portal` and `pnpm dev:backend` start one. `pnpm exec vp dev` starts only the portal; `pnpm exec vp run dev` runs the root script for both services.
- `pnpm test` runs backend then portal Vite+ tests. `pnpm exec vp test` runs both named test projects from the root. Backend tests are colocated under `apps/backend/src`, including `.test.mjs`. They apply `apps/backend/drizzle` SQL to `node:sqlite`. They do not need a running Worker. One backend file: `pnpm --filter @pms/backend test -- src/routes/reservations.test.ts`.
- Portal tests use Vitest through `vite-plus/test`. `pnpm --filter @pms/portal test` runs `apps/portal/tests` alone. One file: `pnpm --filter @pms/portal test -- tests/form-validation.test.ts`, or `pnpm exec vp test --project portal tests/form-validation.test.ts`. Those tests import `../src/**/*.ts`. The dialog suite creates its own happy-dom window and Vite SSR server with an explicit portal root. `tests/tsconfig.json` extends the strict app options and adds Node types. The solution references app, Node configuration, and test projects; `tsconfig.app.json` includes only `src`.
- `pnpm lint` runs Oxlint and native type checking across portal TS/TSX files, backend TypeScript and JavaScript files, and shared schemas, including tests and package configuration. Use `pnpm --filter @pms/portal lint` or `pnpm --filter @pms/backend lint` for one app. Root `vite.config.ts` applies correctness and TypeScript rules to all packages, React rules only to the portal, browser globals to portal source and tests, service-worker globals to backend source, and Node globals to tests, scripts, and tooling. Generated Worker types, migrations, build output, coverage, and package stores are excluded from linting.
- `pnpm format` formats maintained source, configuration, and documentation across the repo. Format only the portal with `pnpm --filter @pms/portal format`. Root `vite.config.ts` owns Oxfmt defaults and the portal Tailwind override. Generated Worker types, Drizzle metadata, lockfiles, installed agent skills, coverage, and package stores are excluded from formatting; Git-ignored files are skipped too. `pnpm check` checks repo formatting, lint, and native types. Both `typeAware` and `typeCheck` are enabled.
- `pnpm typecheck` runs `vp check --no-fmt --no-lint .`. Put Vite+ check flags before paths. Native checks use Vite+'s bundled TypeScript 7 checker and cover portal source, Vite configuration, tests, backend source and configuration, colocated TypeScript tests, and shared schemas. Both portal and backend use the same TypeScript 7 catalog dependency; update its version in `pnpm-workspace.yaml`. Run `pnpm --filter @pms/portal exec tsc -b` or `pnpm --filter @pms/backend typecheck` for standalone compiler checks. The backend retains `tsc --noEmit` for Workers Builds. Root check and typecheck commands use native checking without a duplicate compiler pass. Backend `.mjs` scripts and tests receive syntax linting but no static type checking. Shared has no separate typecheck script.
- After a schema edit in `apps/backend/src/db/schema.ts`, regenerate the baseline as described above, then run `pnpm db:reset:local --rebuild-schema`.
- Refresh Worker types with `pnpm --filter @pms/backend cf-typegen`. Do not edit `apps/backend/worker-configuration.d.ts`.
- `pnpm --filter @pms/backend deploy` migrates `pms-production`, then deploys `pms-api`. `deploy:ci` deploys code and does not change the database. `db:migrate:remote` targets `pms-production`.

## Branch and deployment workflow

- Feature branches merge to `main`. `main` deploys `pms-api` against `pms-production`.
- Production portal builds use `https://pms-api.meldar.workers.dev`. `VITE_API_BASE_URL` is a Workers Builds build variable, inlined at build time.
- Prepare `pms-production` before deploying code that requires a schema change. Rebuild and seed local databases. A consolidated baseline requires rebuilding or replacing the production database, not applying it over existing tables. `deploy` applies pending migrations and does not rebuild an existing database.

## Local API

The portal reads its API origin from `VITE_API_BASE_URL`, inlined at build time. `apps/portal/.env.development` sets it to `http://127.0.0.1:8788`, which matches `wrangler dev --port 8788`. Override it in `.env.local`. `vp build` and `src/lib/api.ts` fail if it is unset. On Cloudflare, set it as a Workers Builds build variable, not a runtime variable. There is no Vite proxy. CORS allows local origins and `pms-portal` production or Preview Workers under the `meldar` workers.dev account.

## Domain

- Dates are `YYYY-MM-DD` UTC calendar dates. A reservation has one `checkIn` and one `checkOut` for every room. Stay nights and room closures are `[start, end)`. A checkout morning is free for the next arrival. Rate ranges include both ends. A stay cannot exceed 60 nights.
- Check-in and checkout change status only. There are no arrival or departure timestamp columns. For an early departure, save the shorter date range together with `checked_out`.
- Guests use `fullName`, not separate first and last names.
- `confirmed`, `checked_in`, and `checked_out` hold inventory. `cancelled` and `no_show` do not. `cancelled` drops room charges from the bill and can leave a credit. Check-in and saving allow unassigned rooms, which still consume room-type inventory.
- Money is integer cents. Currency is `PEN` from the Worker `CURRENCY` var. A night price is the flat rate, else that date's override, else `baseRateCents`. Retained nights keep their saved prices. Added nights use current rates. Changing room type reprices that room.
- Rooms have no operational status. Dated room closures are the only way to block a room and reduce room-type availability. Closures cannot overlap assigned stays or other closures.
- Capacity, overlap, assignment, and staying-guest conflicts are SQLite triggers in `apps/backend/drizzle/0001_overlap_triggers.sql`. That file is hand-written and listed in `drizzle/meta/_journal.json`. `rethrowConflict` maps the trigger abort text to 409. Drizzle does not generate these guards. `0000_schema.sql` is the current drizzle-kit baseline. Tests execute every journal entry, so an unregistered trigger file does not run in tests.

## Code style

- Formatting uses Oxfmt defaults from the root `vite.config.ts` across the repo: double quotes, semicolons, print width 100, and trailing commas wherever supported. The portal TS/TSX override enables Tailwind sorting with `apps/portal/src/index.css` and functions `cn` and `cva`.
- Portal and backend use TypeScript 7 through the shared `typescript` catalog entry. Keep their dependency declarations as `"typescript": "catalog:"`.
- Portal `tsconfig.app.json` enables `verbatimModuleSyntax`, `erasableSyntaxOnly`, and `noUnusedLocals`. Use `import type` or inline `type` imports.
- shadcn is already set up in `apps/portal`. `components.json` style is `base-lyra`. Primitives come from `@base-ui/react`, not Radix. Icons are `lucide-react`. Aliases use `@/`. UI files import `cn` from `"cn"`, not from `@/lib/utils`. Add a component from `apps/portal` with `pnpm exec shadcn add <name>`. Do not use `npx shadcn`.

## Cursor Cloud specific instructions

- `pnpm dev` serves the API at `http://127.0.0.1:8788` and the portal at `http://localhost:5173`. The Vite dev server binds IPv6 localhost only, so `http://127.0.0.1:5173` is refused.
- `pnpm db:reset:local` reloads sample data around today UTC and does not need Cloudflare credentials. Wrangler asks before applying migrations when stdin is a terminal. Prefix that command with `CI=true` so a non-interactive shell accepts the fallback and continues.
- `pnpm build` needs `VITE_API_BASE_URL` in the environment. Dev mode reads `apps/portal/.env.development`.

## Agent skills

### Issue tracker

Track issues and specs in GitHub Issues for `meldarstudio/pms`.
Before issue tracker operations, read `docs/agents/issue-tracker.md`.

### Triage labels

Use the five default triage labels.
Before triage, read `docs/agents/triage-labels.md`.

### Domain docs

Use a single-context layout shared across all packages.
Before exploring domain concepts or architecture, read `docs/agents/domain.md`.
