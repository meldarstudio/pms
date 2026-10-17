# PMS

A pnpm workspace with a React portal, a Hono Cloudflare Worker, and shared Zod
schemas. The web toolchain uses Vite+ 1.3.0.

## Setup

Use Node 22.22.1, pinned in `.node-version`, and pnpm 11.22.0. With nvm:

```sh
nvm install 22.22.1
nvm use 22.22.1
pnpm install
```

pnpm checks the exact Node version before running scripts or `pnpm exec` commands.
If it reports a mismatch, run `nvm use 22.22.1` (or select that version with your
Node manager), then retry. It does not download Node automatically. When upgrading
Node, update both `.node-version` and `devEngines.runtime.version` in `package.json`.

Vite+ is a local dependency. A global `vp` installation is optional.

## Commands

Run these from the repository root.

| Command                                  | Behavior                                                                   |
| ---------------------------------------- | -------------------------------------------------------------------------- |
| `pnpm dev` or `pnpm exec vp run dev`     | Start the portal and local backend                                         |
| `pnpm dev:portal` or `pnpm exec vp dev`  | Start the portal at `http://localhost:5173`                                |
| `pnpm dev:backend`                       | Start the local API at `http://localhost:8788`                             |
| `pnpm lint`                              | Lint and natively type-check the portal, backend, and shared schemas       |
| `pnpm check` or `pnpm exec vp check .`   | Check repo formatting, lint, and native types                              |
| `pnpm typecheck`                         | Check native types without formatting or lint rules                        |
| `pnpm exec vp test`                      | Run the backend and portal test projects                                   |
| `pnpm exec vp test --project portal`     | Run the portal tests only                                                  |
| `pnpm exec vp test --project backend`    | Run the backend tests only                                                 |
| `pnpm test` or `pnpm exec vp run test`   | Run the backend, then portal package test scripts                          |
| `pnpm format`                            | Format maintained source, configuration, and documentation across the repo |
| `pnpm build` or `pnpm exec vp run build` | Typecheck and build the portal                                             |
| `pnpm exec vp -C apps/portal preview`    | Preview the portal production build                                        |

`vp dev`, `vp test`, and `vp build` are built-in tools. `vp run <task>` runs
the corresponding package script or configured task. The root configuration
selects the portal for application commands. Direct `vp build` does not run
the native type-check step in the package's build script; use `pnpm build` for both.

Production builds require `VITE_API_BASE_URL`:

```sh
VITE_API_BASE_URL=http://localhost:8788 pnpm build
```

The portal's development environment already points to the local backend.
Configure the production API origin as a Workers Builds build variable. Its value
is `https://api.hotelmanantialchurin.com`.

## Signing in

The portal and API require the staff login. Before the first `pnpm dev`, create
the local Worker variables:

```sh
cp apps/backend/.dev.vars.example apps/backend/.dev.vars
pnpm auth:hash                  # prompts for a password, prints STAFF_PASSWORD_HASH
pnpm auth:hash --session-secret # prints a SESSION_SECRET
```

Paste both values into `apps/backend/.dev.vars`, then sign in at
`http://localhost:5173` with username `hotelmanantial` and that password. Restart
`pnpm dev:backend` after editing `.dev.vars`; Wrangler does not always reload it.
Use `localhost` for both the portal and the API. `127.0.0.1` is a different site, so
the browser will not send the session cookie.

## Testing

For test changes and code reviews, follow [the testing policy](CODING_STANDARDS.md#tests).
Run one backend file once with:

```sh
pnpm exec vp test run --project backend apps/backend/src/routes/reservations.test.ts
```

Run one portal file once with:

```sh
pnpm exec vp test run --project portal apps/portal/tests/reservation-forms.test.ts
```

These commands run from the repository root. Pass the file path directly, without
an extra `--` separator; that separator can cause the runner to ignore the file
filter and run the whole suite. Existing full-suite commands remain unchanged.

## Tool configuration

The root `vite.config.ts` owns lint rules, formatting, and test project
selection. Formatting uses Oxfmt defaults across maintained source, configuration,
and documentation, with Tailwind class sorting enabled for portal TS/TSX files.
Generated Worker types, Drizzle metadata, lockfiles, installed agent skills,
coverage, and package stores are excluded, along with Git-ignored files.
Linting covers portal TS/TSX files, backend TypeScript and JavaScript files,
and shared schemas, including tests and package configuration. Correctness
and TypeScript rules apply to all packages. React rules apply only to the
portal. Browser globals are limited to portal source and tests; Worker source
uses service-worker globals, and tests, scripts, and tooling use Node globals.
Generated Worker types, migrations, build output, and coverage are excluded.

Use `pnpm --filter @pms/portal lint` or `pnpm --filter @pms/backend lint` for
one app. The root `pnpm lint` covers all three packages.

The root format and check scripts pass `.` explicitly to cover the repository.
Use `pnpm --filter @pms/portal format` to format only the portal.
Place Vite+ check flags before paths, as in `pnpm exec vp check --no-fmt --no-lint .`.

`pnpm check` enables Vite+'s native type checker with `typeAware: true` and
`typeCheck: true`. The portal's solution tsconfig references separate app,
Node configuration, and test projects. `tests/tsconfig.json` extends the strict
app options and adds Node types for the test runner. Tests remain outside the
app project's `src` include. Native checking covers all three projects.

The portal and backend share TypeScript 7 through the `typescript` catalog
entry in `pnpm-workspace.yaml`. Update that entry to upgrade both packages.
Vite+ uses its bundled TypeScript 7 checker for all three packages. You can also run the
installed compiler with `pnpm --filter @pms/portal exec tsc -b`; normal check
and build commands do not run that duplicate compiler pass.

Native checking also covers backend source, configuration, colocated TypeScript
tests, and shared schemas. Root check and typecheck commands do not repeat the
backend compiler pass. `pnpm --filter @pms/backend typecheck` remains available
for standalone backend checks and Workers Builds. Backend `.mjs` scripts and
tests receive syntax linting but are not type-checked.

The shared package exports TypeScript source directly and needs no `vp pack`
step. Wrangler still handles backend development and deployment.

See [portal documentation](apps/portal/README.md) and
[backend documentation](apps/backend/README.md).
