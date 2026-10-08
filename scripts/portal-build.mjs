import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const branch = process.env.WORKERS_CI_BRANCH

if (!branch) throw new Error('WORKERS_CI_BRANCH is required')

const apiOrigin = branch === 'main'
  ? 'https://pms-api.meldar.workers.dev'
  : 'https://staging-pms-api.meldar.workers.dev'
const portalDir = fileURLToPath(new URL('../apps/portal/', import.meta.url))

console.log(`Building portal for ${apiOrigin}`)
const result = spawnSync('pnpm', ['run', 'build'], {
  cwd: portalDir,
  env: { ...process.env, VITE_API_BASE_URL: apiOrigin },
  stdio: 'inherit',
})

if (result.error) throw result.error
if (result.status !== 0) process.exitCode = result.status ?? 1
