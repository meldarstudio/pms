import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { previewName } from './preview-name.mjs'

const branch = process.env.WORKERS_CI_BRANCH
const workersSubdomain = process.env.CLOUDFLARE_WORKERS_SUBDOMAIN
const productionBranch = process.env.WORKERS_CI_PRODUCTION_BRANCH ?? 'main'

if (!branch) throw new Error('WORKERS_CI_BRANCH is required')
if (!workersSubdomain || !/^[a-z0-9-]+$/.test(workersSubdomain)) {
  throw new Error('CLOUDFLARE_WORKERS_SUBDOMAIN must be a workers.dev subdomain')
}

const apiWorker = branch === productionBranch
  ? 'pms-api'
  : `${previewName(branch)}-pms-api`
const apiOrigin = `https://${apiWorker}.${workersSubdomain}.workers.dev`
const portalDir = fileURLToPath(new URL('../apps/portal/', import.meta.url))

console.log(`Building portal for ${apiOrigin}`)
const result = spawnSync('pnpm', ['run', 'build'], {
  cwd: portalDir,
  env: { ...process.env, VITE_API_BASE_URL: apiOrigin },
  stdio: 'inherit',
})

if (result.error) throw result.error
if (result.status !== 0) process.exitCode = result.status ?? 1
