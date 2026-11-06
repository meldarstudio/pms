import { spawn, spawnSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vite-plus/test";

const repo = fileURLToPath(new URL("../../../", import.meta.url));
const temporaryDirs = [];
afterEach(() => {
  for (const directory of temporaryDirs.splice(0)) rmSync(directory, { recursive: true });
});

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "pms-migration-test-"));
  temporaryDirs.push(directory);
  const backend = join(directory, "backend");
  mkdirSync(backend);
  for (const name of ["scripts", "drizzle", "cloudflare.config.ts"])
    cpSync(join(repo, "apps/backend", name), join(backend, name), { recursive: true });
  symlinkSync(join(repo, "apps/backend/node_modules"), join(backend, "node_modules"));
  const names = JSON.parse(
    readFileSync(join(backend, "drizzle/meta/_journal.json"), "utf8"),
  ).entries.map(({ tag }) => `${tag}.sql`);
  const bin = join(directory, "bin");
  mkdirSync(bin);
  const log = join(directory, "commands.jsonl");
  const state = join(directory, "history.json");
  writeFileSync(log, "");
  writeFileSync(state, JSON.stringify(names.slice(0, -1)));
  writeFileSync(
    join(bin, "pnpm"),
    `#!/usr/bin/env node
const { readFileSync, writeFileSync, readdirSync, appendFileSync } = require('node:fs');
const { join } = require('node:path');
const args = process.argv.slice(2);
const value = (flag) => args[args.indexOf(flag) + 1];
const snapshot = args.includes('--dir') ? value('--dir') : null;
const files = snapshot ? readdirSync(snapshot).map(name => ({ name, sql: readFileSync(join(snapshot, name), 'utf8') })) : [];
appendFileSync(process.env.COMMAND_LOG, JSON.stringify({ args, files }) + '\\n');
const isExport = args[1] === 'wrangler' && args[3] === 'export' && args.includes('--remote')
  && JSON.parse(readFileSync(value('--config'), 'utf8')).d1_databases[0].database_id === process.env.DATABASE_ID;
const isCf = args[1] === 'cf' && !args.includes('--local') && args[args[3] === 'migrations' ? 5 : 4] === process.env.DATABASE_ID;
if (args[0] !== 'exec' || args[2] !== 'd1' || !(isExport || isCf)) process.exit(91);
const history = JSON.parse(readFileSync(process.env.HISTORY, 'utf8'));
if (args[3] === 'query') {
  const sql = value('--sql');
  const results = sql.includes('sqlite_master') ? [{ name: 'd1_migrations' }] : history.map(name => ({ name }));
  process.stdout.write(JSON.stringify([{ success: true, results }]));
} else if (args[3] === 'export') {
  writeFileSync(value('--output'), '-- simulated production export\\n');
} else if (args[3] === 'migrations' && args[4] === 'apply' && files.length === 1) {
  writeFileSync(process.env.HISTORY, JSON.stringify([...history, files[0].name]));
} else process.exit(92);
`,
    { mode: 0o755 },
  );
  return {
    directory,
    backend,
    names,
    log,
    env: {
      PATH: `${bin}:${process.env.PATH}`,
      HOME: directory,
      CI: "false",
      COMMAND_LOG: log,
      HISTORY: state,
      DATABASE_ID: "17e838dd-b2f9-4783-ad9b-f5d837701428",
      TERM: "dumb",
    },
  };
}

function commands(f) {
  return readFileSync(f.log, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function interactive(f, approve = () => "pms-production") {
  const script = join(f.backend, "scripts/migrate-production.mjs");
  const terminal = `
import errno, os, pty, select, sys
pid, fd = pty.fork()
if pid == 0:
    os.execv(sys.argv[1], sys.argv[1:])
while True:
    ready, _, _ = select.select([fd, sys.stdin], [], [])
    if fd in ready:
        try:
            data = os.read(fd, 65536)
        except OSError as error:
            if error.errno != errno.EIO: raise
            break
        if not data: break
        os.write(sys.stdout.fileno(), data)
    if sys.stdin in ready:
        data = os.read(sys.stdin.fileno(), 65536)
        if data: os.write(fd, data)
_, status = os.waitpid(pid, 0)
sys.exit(os.waitstatus_to_exitcode(status))
`;
  return await new Promise((resolve, reject) => {
    const child = spawn("python3", ["-c", terminal, process.execPath, script], {
      env: f.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "";
    let answered = false;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Migration test timed out: ${output}`));
    }, 15000);
    child.on("error", reject);
    const collect = (chunk) => {
      output += chunk;
      if (!answered && output.includes("to approve this SQL, the backup, and downtime:")) {
        answered = true;
        child.stdin.write(`${approve()}\n`);
      }
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status, output });
    });
  });
}

it("refuses noninteractive production migrations before invoking any external tool", () => {
  const f = fixture();
  const result = spawnSync(process.execPath, [join(f.backend, "scripts/migrate-production.mjs")], {
    env: f.env,
    encoding: "utf8",
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("require an interactive terminal outside CI");
  expect(commands(f)).toEqual([]);
});

it("refuses production migration in CI even with a terminal", async () => {
  const f = fixture();
  f.env.CI = "true";
  const result = await interactive(f);
  expect(result.status, result.output).toBe(1);
  expect(result.output).toContain("require an interactive terminal outside CI");
  expect(commands(f)).toEqual([]);
});

it("keeps approved SQL hashes, private snapshots and export/report behavior", async () => {
  const f = fixture();
  const name = f.names.at(-1);
  const sql = "SELECT 1;\n";
  writeFileSync(join(f.backend, "drizzle", name), sql);
  const result = await interactive(f);
  expect(result.status, result.output).toBe(0);
  const calls = commands(f);
  const apply = calls.find(({ args }) => args[3] === "migrations");
  expect(apply.files).toEqual([{ name, sql }]);
  expect(apply.args[apply.args.indexOf("--dir") + 1]).not.toBe(join(f.backend, "drizzle"));
  const root = join(f.directory, ".pms-production-backups");
  const report = JSON.parse(readFileSync(join(root, readdirSync(root)[0], "report.json"), "utf8"));
  expect(report.status).toBe("succeeded");
  expect(report.planned).toEqual([
    { name, sha256: "b4e0497804e46e0a0b0b8c31975b062152d551bac49c3c2e80932567b4085dcd" },
  ]);
  expect(result.output).toContain(report.planned[0].sha256);
  expect(report.backup.sha256).toBe(
    "23b8c565ccd839c203eddcbdadcf88c89953e4a0c4b5e1d367cdefa2d5049931",
  );
  expect(report.applied).toEqual([name]);
  expect(calls.findIndex(({ args }) => args[3] === "export")).toBeLessThan(calls.indexOf(apply));
});

it.each(["SQL", "configuration"])(
  "stops if approved %s changes before export or migration",
  async (kind) => {
    const f = fixture();
    const path = join(
      f.backend,
      kind === "SQL" ? `drizzle/${f.names.at(-1)}` : "cloudflare.config.ts",
    );
    const result = await interactive(f, () => {
      writeFileSync(path, readFileSync(path, "utf8") + "\n");
      return "pms-production";
    });
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain("changed; review and approve a new run");
    expect(commands(f).every(({ args }) => args[3] === "query")).toBe(true);
  },
);
