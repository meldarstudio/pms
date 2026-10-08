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

## Deployment

Production portal: `https://pms-portal.meldar.workers.dev`
