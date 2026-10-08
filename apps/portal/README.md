# Portal

The portal is a Vite SPA deployed as static assets on the `pms-portal`
Cloudflare Worker.

Run it locally from the repository root:

```sh
pnpm dev:portal
```

The local client tries the local API ports before the Vite `/api` proxy. A
production Cloudflare build embeds the production API URL. Every branch Preview
uses the stable staging API at
`https://staging-pms-api.meldar.workers.dev`.

## Deployment

Production portal: `https://pms-portal.meldar.workers.dev`

Build and deploy production from the repository root:

```sh
WORKERS_CI_BRANCH=main \
  CLOUDFLARE_WORKERS_SUBDOMAIN=meldar \
  pnpm --filter @pms/portal build:cloudflare
pnpm --filter @pms/portal run deploy
```

For Workers Builds, use these settings:

- Build command: `pnpm --filter @pms/portal build:cloudflare`
- Deploy command: `pnpm --filter @pms/portal run deploy`
- Preview command: `pnpm --filter @pms/portal run deploy:preview`
- Build variable: `CLOUDFLARE_WORKERS_SUBDOMAIN=meldar`

Workers Builds provides `WORKERS_CI_BRANCH`. The build script uses it to embed
the production API URL for `main` and the stable staging API URL for every other
branch. Portal Previews therefore do not require matching API branch Previews.

Under **Settings > Build > Build watch paths**, set the portal Worker's include
paths to:

```text
apps/portal/*
packages/shared/*
scripts/*
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
```

Leave exclude paths empty. This prevents backend-only commits from deploying
the portal. Keep `CLOUDFLARE_WORKERS_SUBDOMAIN=meldar` in the build variables.
