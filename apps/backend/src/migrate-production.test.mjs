import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vite-plus/test";

const repo = fileURLToPath(new URL("../../../", import.meta.url));
const attachedTerminal = "data:text/javascript,process.stdin.isTTY=true;process.stdout.isTTY=true";
const databaseId = "17e838dd-b2f9-4783-ad9b-f5d837701428";
const temporaryDirs = [];
afterEach(() => {
  for (const directory of temporaryDirs.splice(0)) rmSync(directory, { recursive: true });
});

function fixture({ pending = 2, stub = {} } = {}) {
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
  const log = join(directory, "commands.log");
  const history = join(directory, "history.json");
  writeFileSync(log, "");
  writeFileSync(history, JSON.stringify(names.slice(0, names.length - pending)));
  writeFileSync(
    join(bin, "pnpm"),
    `#!/usr/bin/env node
const { appendFileSync, readFileSync, writeFileSync } = require('node:fs');
const args = process.argv.slice(2);
appendFileSync(process.env.COMMAND_LOG, args.slice(3, 6).join(' ') + '\\n');
if (args[0] !== 'exec' || args[1] !== 'cf' || args[2] !== 'd1' || args.includes('--local')) process.exit(91);
const stub = JSON.parse(process.env.STUB);
const names = JSON.parse(process.env.NAMES);
const applied = JSON.parse(readFileSync(process.env.HISTORY, 'utf8'));
if (args[3] === 'query') {
  process.stdout.write(JSON.stringify([{ success: true, results: applied.map((name) => ({ name })) }]));
} else if (args[3] === 'time-travel' && args[4] === 'get-bookmark') {
  if (stub.bookmark === 'fails') process.exit(1);
  process.stdout.write(JSON.stringify(stub.bookmark === 'missing' ? {} : { bookmark: 'before-migration' }));
} else if (args[3] === 'migrations' && args[4] === 'apply' && args[args.indexOf('--dir') + 1] === 'drizzle') {
  if (stub.apply === 'first-then-fails') {
    writeFileSync(process.env.HISTORY, JSON.stringify(names.slice(0, applied.length + 1)));
    process.exit(1);
  }
  if (stub.apply === 'fails-and-loses-ledger') {
    writeFileSync(process.env.HISTORY, 'unreadable');
    process.exit(1);
  }
  writeFileSync(process.env.HISTORY, JSON.stringify(names));
} else process.exit(92);
`,
    { mode: 0o755 },
  );
  return {
    directory,
    backend,
    names,
    log,
    history,
    env: {
      PATH: `${bin}:${process.env.PATH}`,
      HOME: directory,
      CI: "false",
      COMMAND_LOG: log,
      HISTORY: history,
      NAMES: JSON.stringify(names),
      STUB: JSON.stringify(stub),
    },
  };
}

function migrate(f, { terminal = true, answer = "pms-production" } = {}) {
  const script = join(f.backend, "scripts/migrate-production.mjs");
  const result = spawnSync(
    process.execPath,
    [...(terminal ? ["--import", attachedTerminal] : []), script],
    { env: f.env, encoding: "utf8", input: `${answer}\n`, timeout: 15000 },
  );
  return { status: result.status, output: result.stdout + result.stderr };
}

function commands(f) {
  return readFileSync(f.log, "utf8").trim().split("\n").filter(Boolean);
}

const readLedger = `query ${databaseId} --sql`;
const readBookmark = `time-travel get-bookmark ${databaseId}`;

it("refuses to run without a terminal before invoking any external tool", () => {
  const f = fixture();
  const result = migrate(f, { terminal: false });
  expect(result.status).toBe(1);
  expect(result.output).toContain("require an interactive terminal outside CI");
  expect(commands(f)).toEqual([]);
});

it.each([
  ["an empty ledger", () => []],
  ["a renamed migration", (names) => ["0000_other.sql", ...names.slice(1)]],
  ["history newer than this commit", (names) => [...names, "9999_future.sql"]],
])("refuses %s before asking for approval", (_, ledger) => {
  const f = fixture();
  writeFileSync(f.history, JSON.stringify(ledger(f.names)));
  const result = migrate(f);
  expect(result.status).toBe(1);
  expect(result.output).toContain("not a prefix");
  expect(commands(f)).toEqual([readLedger]);
});

it("shows the pending SQL and changes nothing when approval does not match", () => {
  const f = fixture();
  const sql = "SELECT 'pending migration under review';";
  writeFileSync(join(f.backend, "drizzle", f.names.at(-1)), sql);
  const result = migrate(f, { answer: "yes" });
  expect(result.status).toBe(1);
  expect(result.output).toContain(sql);
  expect(result.output).toContain("Approval did not match");
  expect(commands(f)).toEqual([readLedger]);
});

it.each([
  ["cannot be read", "fails", /cf d1 time-travel failed/],
  ["is missing", "missing", /No Time Travel bookmark/],
])("applies nothing when the bookmark %s", (_, bookmark, message) => {
  const f = fixture({ stub: { bookmark } });
  const result = migrate(f);
  expect(result.status).toBe(1);
  expect(result.output).toMatch(message);
  expect(commands(f)).toEqual([readLedger, readBookmark]);
});

it("stops on a failed migration and prints what the ledger recorded", () => {
  const f = fixture({ stub: { apply: "first-then-fails" } });
  const result = migrate(f);
  expect(result.status).toBe(1);
  expect(result.output).toContain(`Ledger records these new migrations: ${f.names.at(-2)}`);
  expect(result.output).not.toContain(f.names.at(-1) + ",");
  expect(result.output).toContain("cf d1 migrations failed");
});
