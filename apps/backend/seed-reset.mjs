import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildResetSql, referenceDate } from './seed-data.mjs'

const backendDir = fileURLToPath(new URL('.', import.meta.url))

function runWrangler(args, captureOutput = false) {
  const result = spawnSync('pnpm', ['exec', 'wrangler', ...args], {
    cwd: backendDir, stdio: captureOutput ? ['inherit', 'pipe', 'inherit'] : 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    if (captureOutput && result.stdout) process.stderr.write(result.stdout)
    throw new Error(`Wrangler failed${result.signal ? ` with signal ${result.signal}` : ` with exit code ${result.status}`}`)
  }
}

function main() {
  const args = process.argv.slice(2)
  if (args.length === 1 && args[0] === '--help') {
    console.log('Usage: pnpm db:reset:local [--date=YYYY-MM-DD] [--persist-to=PATH]')
    console.log('       pnpm --filter @pms/backend db:reset:preview [--date=YYYY-MM-DD]')
    console.log('Replaces application data with dummy data. Defaults to today in UTC.')
    return
  }
  const options = new Map()
  for (let index = 0; index < args.length; index++) {
    const [option, ...parts] = args[index].split('=')
    if (!['--date', '--persist-to', '--remote-preview'].includes(option)) throw new Error(`Unknown option: ${option}`)
    if (options.has(option)) throw new Error(`Duplicate option: ${option}`)
    if (option === '--remote-preview') {
      if (parts.length) throw new Error(`Unknown option: ${args[index]}`)
      options.set(option, true)
      continue
    }
    const value = parts.length ? parts.join('=') : args[++index]
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${option}`)
    options.set(option, value)
  }
  if (options.has('--remote-preview') && options.has('--persist-to')) {
    throw new Error('--persist-to cannot be used with --remote-preview')
  }

  const anchor = referenceDate(options.get('--date'))
  // Generate and validate everything before migrations or deletion.
  const sql = buildResetSql(anchor)
  const persistArgs = options.has('--persist-to') ? ['--persist-to', resolve(options.get('--persist-to'))] : []
  const temporaryDir = mkdtempSync(join(tmpdir(), 'pms-reset-'))
  try {
    const sqlPath = join(temporaryDir, 'seed.sql')
    writeFileSync(sqlPath, sql)
    if (options.has('--remote-preview')) {
      const configArgs = ['--config', 'wrangler.preview-migrations.jsonc']
      console.log(`Replacing remote preview PMS data with sample data around ${anchor} UTC.`)
      runWrangler(['d1', 'migrations', 'apply', 'PREVIEW_DB', '--remote', ...configArgs])
      runWrangler(['d1', 'execute', 'PREVIEW_DB', '--remote', ...configArgs, '--file', sqlPath, '--json'], true)
      console.log('Remote preview database reset.')
    } else {
      console.log(`Replacing local PMS data with sample data around ${anchor} UTC.`)
      runWrangler(['d1', 'migrations', 'apply', 'pms', '--local', ...persistArgs])
      runWrangler(['d1', 'execute', 'pms', '--local', ...persistArgs, '--file', sqlPath, '--json'], true)
      console.log('Local database reset. Refresh the portal to load the sample data.')
    }
  } finally {
    rmSync(temporaryDir, { recursive: true, force: true })
  }
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
