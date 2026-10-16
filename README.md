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

Vite+ is a local dependency. A global `vp` installation is optional.

## Commands

Run these from the repository root.

| Command                                  | Behavior                                                                   |
| ---------------------------------------- | -------------------------------------------------------------------------- |
| `pnpm dev` or `pnpm exec vp run dev`     | Start the portal and local backend                                         |
| `pnpm exec vp dev`                       | Start the portal at `http://localhost:5173`                                |
| `pnpm dev:backend`                       | Start the local API at `http://127.0.0.1:8788`                             |
| `pnpm check`                             | Check formatting and lint, then run each package's TypeScript compiler     |
| `pnpm exec vp check .`                   | Check repo formatting and portal lint with the root configuration          |
| `pnpm exec vp test`                      | Run all 203 tests across the backend and portal projects                   |
| `pnpm exec vp test --project portal`     | Run the portal tests only                                                  |
| `pnpm exec vp test --project backend`    | Run the backend tests only                                                 |
| `pnpm test` or `pnpm exec vp run test`   | Run the backend, then portal package test scripts                          |
| `pnpm format`                            | Format maintained source, configuration, and documentation across the repo |
| `pnpm build` or `pnpm exec vp run build` | Typecheck and build the portal                                             |
| `pnpm exec vp -C apps/portal preview`    | Preview the portal production build                                        |

`vp dev`, `vp test`, and `vp build` are built-in tools. `vp run <task>` runs
the corresponding package script or configured task. The root configuration
selects the portal for application commands. Direct `vp build` does not run
the `tsc -b` step in the package's build script; use `pnpm build` for both.

Production builds require `VITE_API_BASE_URL`:

```sh
VITE_API_BASE_URL=http://127.0.0.1:8788 pnpm build
```

The portal's development environment already points to the local backend.
Configure the production API origin as a Workers Builds build variable.

## Tool configuration

The root `vite.config.ts` owns lint rules, formatting, and test project
selection. Formatting uses Oxfmt defaults across maintained source, configuration,
and documentation, with Tailwind class sorting enabled for portal TS/TSX files.
Generated Worker types, Drizzle metadata, lockfiles, installed agent skills,
coverage, and package stores are excluded, along with Git-ignored files.
Linting covers portal TS/TSX files and keeps its React Hooks rules.

The root format and check scripts pass `.` explicitly to cover the repository.
Use `pnpm --filter @pms/portal format` to format only the portal.

`pnpm check` retains the portal's TypeScript 6 project-reference checks and
the backend's TypeScript 7 checks. Native Vite+ type checking is disabled
because it also checks portal tests excluded by the existing tsconfig.

The shared package exports TypeScript source directly and needs no `vp pack`
step. Wrangler still handles backend development and deployment.

See [portal documentation](apps/portal/README.md) and
[backend documentation](apps/backend/README.md).
