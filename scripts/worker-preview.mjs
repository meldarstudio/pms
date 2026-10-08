import { spawnSync } from 'node:child_process'
import { previewName } from './preview-name.mjs'

function currentBranch() {
  if (process.env.WORKERS_CI_BRANCH) return process.env.WORKERS_CI_BRANCH

  const result = spawnSync('git', ['branch', '--show-current'], { encoding: 'utf8' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error('Could not determine the current git branch')
  return result.stdout.trim()
}

const name = previewName(currentBranch())
const result = spawnSync(
  'pnpm',
  ['exec', 'wrangler', 'preview', '--name', name, ...process.argv.slice(2)],
  { stdio: 'inherit' },
)

if (result.error) throw result.error
if (result.status !== 0) process.exitCode = result.status ?? 1
