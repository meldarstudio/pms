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
import { load } from "js-yaml";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { checkLedger } from "../scripts/check-production-readiness.mjs";
import { productionTarget, validateMigrationManifest } from "../scripts/production-migrations.mjs";

const repo = fileURLToPath(new URL("../../../", import.meta.url));
const workflow = load(readFileSync(join(repo, ".github/workflows/release.yml"), "utf8"));
const steps = workflow.jobs.release.steps;

describe("production readiness rules", () => {
  const names = ["0000_schema.sql", "0001_rooms.sql", "0002_rates.sql"];
  const rows = names.map((name, index) => ({ id: index + 1, name }));
  const ledger = (results) => [{ success: true, results }];

  it("accepts a ledger that exactly matches the selected commit", () => {
    expect(() => checkLedger(names, ledger(rows))).not.toThrow();
  });

  it.each([
    ["pending migration (code deployed before its schema)", ledger(rows.slice(0, -1))],
    [
      "newer production history (rollback across histories)",
      ledger([...rows, { id: 4, name: "0003_future.sql" }]),
    ],
    [
      "different history (renamed migration)",
      ledger([{ id: 1, name: "0000_other.sql" }, ...rows.slice(1)]),
    ],
    ["out-of-order history", ledger([rows[1], rows[0], rows[2]])],
    ["nonsequential ids", ledger(rows.map((row) => ({ ...row, id: row.id + 1 })))],
    ["duplicate row", ledger([rows[0], rows[0], rows[2]])],
    ["malformed row", ledger([{ id: "1", name: names[0] }, ...rows.slice(1)])],
    ["empty production history", ledger([])],
    ["failed query envelope", [{ success: false, results: rows }]],
    ["missing query envelope", []],
    ["malformed query envelope", [{ success: true, results: {} }]],
    ["extra query results", [...ledger(rows), ...ledger(rows)]],
  ])("blocks deployment for %s", (_, response) => {
    expect(() => checkLedger(names, response)).toThrow(/does not exactly match/);
  });

  it("blocks deployment when the selected commit registers no migrations", () => {
    expect(() => checkLedger([], ledger([]))).toThrow(/does not exactly match/);
  });

  const journal = (...tags) => ({ entries: tags.map((tag, idx) => ({ idx, tag })) });
  const sql = (name, text = "SELECT 1;") => ({ name, regular: true, sql: text });
  const registered = () => [sql("0000_schema.sql"), sql("0001_rooms.sql")];

  it("accepts registered, nonempty SQL in journal order", () => {
    const manifest = validateMigrationManifest(journal("0000_schema", "0001_rooms"), registered());
    expect(manifest.map(({ name }) => name)).toEqual(["0000_schema.sql", "0001_rooms.sql"]);
  });

  it.each([
    ["missing journal entries", { entries: undefined }, registered(), /Invalid migration journal/],
    [
      "journal index mismatch",
      {
        entries: [
          { idx: 1, tag: "0000_schema" },
          { idx: 1, tag: "0001_rooms" },
        ],
      },
      registered(),
      /Invalid migration journal/,
    ],
    [
      "malformed journal tag",
      journal("0000_schema", "rooms"),
      registered(),
      /Invalid migration journal/,
    ],
    ["empty journal", journal(), [], /disagree/],
    ["unregistered SQL file", journal("0000_schema"), registered(), /disagree/],
    [
      "missing SQL file",
      journal("0000_schema", "0001_rooms"),
      [sql("0000_schema.sql")],
      /disagree/,
    ],
    [
      "nonregular SQL file",
      journal("0000_schema", "0001_rooms"),
      [sql("0000_schema.sql"), { name: "0001_rooms.sql", regular: false, sql: "" }],
      /regular files/,
    ],
    [
      "out-of-order journal",
      journal("0001_rooms", "0000_schema"),
      registered(),
      /ascending journal order/,
    ],
    [
      "empty SQL file",
      journal("0000_schema", "0001_rooms"),
      [sql("0000_schema.sql"), sql("0001_rooms.sql", "\n")],
      /Empty migration: 0001_rooms.sql/,
    ],
  ])("rejects a manifest with %s", (_, manifestJournal, files, error) => {
    expect(() => validateMigrationManifest(manifestJournal, files)).toThrow(error);
  });

  const id = "00000000-0000-4000-8000-000000000000";
  const production = { binding: "DB", database_name: "pms-production", database_id: id };
  const config = (...databases) => ({ name: "pms-api", d1_databases: databases });

  it("accepts the single production database bound as DB", () => {
    expect(productionTarget(config(production))).toBe(production);
  });

  it.each([
    ["malformed database identity", config({ ...production, database_id: "not-a-uuid" })],
    [
      "second binding to the production database",
      config({ ...production, binding: "OTHER" }, production),
    ],
    ["DB bound to another database", config({ ...production, database_name: "other" }, production)],
  ])("rejects a production target with %s", (_, wranglerConfig) => {
    expect(() => productionTarget(wranglerConfig)).toThrow(/Unexpected production configuration/);
  });
});

it("is manual, serialized without cancellation, read-only, and stops at the first failure", () => {
  expect(Object.keys(workflow.on)).toEqual(["workflow_dispatch"]);
  expect(workflow.permissions).toEqual({ contents: "read" });
  expect(workflow.concurrency["cancel-in-progress"]).toBe(false);
  expect(workflow.concurrency.group).toBeTypeOf("string");
  expect(workflow.concurrency.group).not.toContain("${{");
  const checkout = steps.find((step) => step.uses?.startsWith("actions/checkout@"));
  expect(checkout.with["persist-credentials"]).toBe(false);
  // Actions are not executed by the harness below, so guard their credential
  // boundary statically, including workflow- and job-level environments.
  for (const settings of [workflow, workflow.jobs.release, ...steps.filter((step) => step.uses)]) {
    expect(JSON.stringify(settings.env ?? {})).not.toContain("secrets.");
    expect(JSON.stringify(settings.with ?? {})).not.toContain("secrets.");
  }
  // Production steps are gated on every earlier step; only the summary always runs.
  expect(workflow.jobs.release["continue-on-error"]).toBeUndefined();
  expect(workflow.jobs.release.if).toBeUndefined();
  expect(steps.map((step) => step.if ?? null)).toEqual([
    ...steps.slice(1).map(() => null),
    "always()",
  ]);
  expect(steps.filter((step) => "continue-on-error" in step)).toEqual([]);
});

// End-to-end wiring: run the real `run:` blocks of release.yml in a temporary git
// repository with a fake pnpm that logs each command, its checkout, and its
// credentials. Actions are represented by a local checkout and runtime checks.
const validationCommands = [
  "install --frozen-lockfile",
  "check",
  "test",
  "build",
  "--filter @pms/backend exec wrangler deploy --dry-run --minify",
];
const ledgerQuery =
  "--filter @pms/backend exec wrangler d1 execute DB --remote --json --command SELECT id, name FROM d1_migrations ORDER BY id --config wrangler.jsonc";
const apiDeploy = "--filter @pms/backend run deploy";
const portalDeploy = "--filter @pms/portal run deploy";
const temporaryDirs = [];

afterEach(() => {
  for (const directory of temporaryDirs.splice(0)) rmSync(directory, { recursive: true });
});

function git(cwd, ...args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

// Commits: the selected release, an unmerged branch, and a later main whose
// runtime pins differ, so setup reading advancing main would be detected.
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "pms-release-test-"));
  temporaryDirs.push(directory);
  const cwd = join(directory, "checkout");
  mkdirSync(join(cwd, "apps/backend"), { recursive: true });
  for (const name of ["scripts", "drizzle", "wrangler.jsonc"]) {
    cpSync(join(repo, "apps/backend", name), join(cwd, "apps/backend", name), { recursive: true });
  }
  // Post-deployment checks have their own tests; never contact production here.
  for (const name of ["smoke-production.mjs", "record-production-release.mjs"]) {
    writeFileSync(join(cwd, "apps/backend/scripts", name), "// Excluded from this harness.\n");
  }
  cpSync(join(repo, "package.json"), join(cwd, "package.json"));
  cpSync(join(repo, ".node-version"), join(cwd, ".node-version"));
  const packageJson = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));
  const selected = {
    packageManager: packageJson.packageManager,
    node: readFileSync(join(cwd, ".node-version"), "utf8").trim(),
  };
  git(cwd, "init", "-b", "main");
  git(cwd, "config", "user.email", "release-test@example.invalid");
  git(cwd, "config", "user.name", "Release test");
  writeFileSync(join(cwd, "revision.txt"), "selected release");
  git(cwd, "add", ".");
  git(cwd, "commit", "-m", "selected release");
  const sha = git(cwd, "rev-parse", "HEAD");
  git(cwd, "checkout", "-b", "unmerged");
  writeFileSync(join(cwd, "revision.txt"), "unmerged feature");
  git(cwd, "commit", "-am", "unmerged feature");
  const unmerged = git(cwd, "rev-parse", "HEAD");
  git(cwd, "checkout", "main");
  writeFileSync(join(cwd, "revision.txt"), "later merge");
  writeFileSync(join(cwd, ".node-version"), "99.0.0\n");
  writeFileSync(
    join(cwd, "package.json"),
    JSON.stringify({ ...packageJson, packageManager: "pnpm@99.0.0" }),
  );
  git(cwd, "commit", "-am", "later merge");
  git(cwd, "update-ref", "refs/remotes/origin/main", "HEAD");
  symlinkSync(join(repo, "apps/backend/node_modules"), join(cwd, "apps/backend/node_modules"));

  const bin = join(directory, "bin");
  mkdirSync(bin);
  const log = join(directory, "commands.jsonl");
  writeFileSync(log, "");
  writeFileSync(
    join(bin, "pnpm"),
    `#!/usr/bin/env node
const { appendFileSync, readFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const command = process.argv.slice(2).join(' ');
if (command === 'install --frozen-lockfile' && process.env.ADVANCE_MAIN === 'true') {
  if (spawnSync('git', ['update-ref', 'refs/remotes/origin/main', 'main']).status !== 0) process.exit(93);
}
appendFileSync(process.env.COMMAND_LOG, JSON.stringify({
  command,
  sha: spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim(),
  source: readFileSync('revision.txt', 'utf8'),
  token: process.env.CLOUDFLARE_API_TOKEN ?? null,
  account: process.env.CLOUDFLARE_ACCOUNT_ID ?? null,
  origin: process.env.VITE_API_BASE_URL ?? null,
}) + '\\n');
if (command === process.env.FAIL_COMMAND) process.exit(1);
if (!JSON.parse(process.env.KNOWN_COMMANDS).includes(command)) process.exit(92);
if (command === process.env.LEDGER_QUERY) process.stdout.write(process.env.LEDGER);
`,
    { mode: 0o755 },
  );
  const ledger = JSON.parse(
    readFileSync(join(cwd, "apps/backend/drizzle/meta/_journal.json"), "utf8"),
  ).entries.map((entry, index) => ({ id: index + 1, name: `${entry.tag}.sql` }));
  return { cwd, sha, unmerged, selected, bin, log, ledger, directory };
}

// Only the default success gate and always() are modeled; the static test above
// pins the workflow to those semantics.
function release(f, options = {}) {
  const job = options.steps ?? steps;
  const context = {
    "inputs.commit_sha": options.sha ?? f.sha,
    "secrets.CLOUDFLARE_ACCOUNT_ID": "simulated-account",
    "secrets.CLOUDFLARE_READ_TOKEN": "simulated-read-token",
    "secrets.CLOUDFLARE_DEPLOY_TOKEN": "simulated-deploy-token",
    "runner.temp": f.directory,
  };
  const interpolate = (value) =>
    String(value).replace(/\$\{\{\s*(.*?)\s*\}\}/g, (_, key) => {
      if (!(key in context)) throw new Error(`Unsupported workflow expression: ${key}`);
      return context[key];
    });
  const summary = join(f.directory, "summary.md");
  writeFileSync(summary, "");
  let failed = false;
  let diagnostics = "";
  for (const [index, step] of job.entries()) {
    const id = step.id ?? `step${index}`;
    context[`steps.${id}.outcome`] = "skipped";
    if (failed && step.if !== "always()") continue;
    const runtimeFromSelection = (actual, expected) => {
      if (actual !== expected)
        throw new Error(`Runtime ${actual} is not from the selected checkout`);
    };
    if (step.uses?.startsWith("actions/checkout@")) {
      git(f.cwd, "checkout", "--detach", interpolate(step.with.ref));
    } else if (step.uses?.startsWith("pnpm/action-setup@")) {
      expect(step.with).toEqual({ run_install: false });
      const { packageManager } = JSON.parse(readFileSync(join(f.cwd, "package.json"), "utf8"));
      runtimeFromSelection(packageManager, f.selected.packageManager);
    } else if (step.uses?.startsWith("actions/setup-node@")) {
      expect(step.with).toEqual({ "node-version-file": ".node-version", cache: "pnpm" });
      const version = readFileSync(join(f.cwd, step.with["node-version-file"]), "utf8").trim();
      runtimeFromSelection(version, f.selected.node);
    } else if (step.uses) {
      throw new Error(`Unsupported action: ${step.uses}`);
    } else {
      const result = spawnSync(
        "bash",
        ["--noprofile", "--norc", "-eo", "pipefail", "-c", step.run],
        {
          cwd: f.cwd,
          encoding: "utf8",
          env: {
            PATH: `${f.bin}:${process.env.PATH}`,
            HOME: f.directory,
            CI: "true",
            GITHUB_REF: options.ref ?? "refs/heads/main",
            GITHUB_STEP_SUMMARY: summary,
            COMMAND_LOG: f.log,
            KNOWN_COMMANDS: JSON.stringify([
              ...validationCommands,
              ledgerQuery,
              apiDeploy,
              portalDeploy,
            ]),
            LEDGER_QUERY: ledgerQuery,
            LEDGER: JSON.stringify([{ success: true, results: options.ledger ?? f.ledger }]),
            FAIL_COMMAND: options.fail ?? "",
            ADVANCE_MAIN: String(options.advanceMain ?? false),
            ...Object.fromEntries(
              [workflow.env, workflow.jobs.release.env, step.env]
                .flatMap((env) => Object.entries(env ?? {}))
                .map(([k, v]) => [k, interpolate(v)]),
            ),
          },
        },
      );
      diagnostics += result.stdout + result.stderr;
      context[`steps.${id}.outcome`] = result.status === 0 ? "success" : "failure";
      if (result.status !== 0) failed = true;
    }
  }
  return {
    failed,
    diagnostics,
    summary: readFileSync(summary, "utf8"),
    commands: readFileSync(f.log, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line)),
  };
}

it("validates and builds the selected main revision before read-only readiness, API, then portal", () => {
  const f = fixture();
  git(f.cwd, "update-ref", "refs/remotes/origin/main", f.sha);
  const result = release(f, { advanceMain: true });
  expect(result.failed, result.diagnostics).toBe(false);
  expect(git(f.cwd, "rev-parse", "refs/remotes/origin/main")).not.toBe(f.sha);
  expect(result.commands.map(({ command }) => command)).toEqual([
    ...validationCommands,
    ledgerQuery,
    apiDeploy,
    portalDeploy,
  ]);
  for (const command of result.commands) {
    expect(command.sha).toBe(f.sha);
    expect(command.source).toBe("selected release");
  }
  expect(
    result.commands
      .slice(0, validationCommands.length)
      .map(({ token, account }) => ({ token, account })),
  ).toEqual(validationCommands.map(() => ({ token: null, account: null })));
  expect(result.commands[validationCommands.indexOf("build")].origin).toBe(
    "https://api.hotelmanantialchurin.com",
  );
  expect(result.commands.slice(validationCommands.length).map(({ token }) => token)).toEqual([
    "simulated-read-token",
    "simulated-deploy-token",
    "simulated-deploy-token",
  ]);
  expect(result.summary).toContain(f.sha);
  expect(result.summary).toContain("API: success");
  expect(result.summary).toContain("Portal: success");
  expect(result.summary).toContain("not yet verified");
});

it("detects runtime setup that would read advancing main instead of the selected commit", () => {
  const f = fixture();
  const reordered = [...steps];
  const source = reordered.findIndex((step) => step.id === "source");
  reordered.splice(source + 2, 0, ...reordered.splice(source, 1));
  expect(() => release(f, { steps: reordered })).toThrow(/not from the selected checkout/);
  expect(readFileSync(f.log, "utf8")).toBe("");
});

it.each([
  ["a branch name instead of a SHA", () => ({ sha: "main" })],
  ["an unmerged commit", (f) => ({ sha: f.unmerged })],
  ["a dispatch from outside main", () => ({ ref: "refs/heads/unmerged" })],
])("rejects %s before validation or production access", (_, options) => {
  const f = fixture();
  const result = release(f, options(f));
  expect(result.failed, result.diagnostics).toBe(true);
  expect(result.commands).toEqual([]);
  expect(result.summary).toContain("Source accepted: failure");
  expect(result.summary).toContain("API: skipped");
  expect(result.summary).toContain("Portal: skipped");
});

it.each([
  ["a pending migration", (f) => ({ ledger: f.ledger.slice(0, -1) })],
  ["a failed ledger query", () => ({ fail: ledgerQuery })],
])("blocks both deployments for %s without database writes", (_, options) => {
  const f = fixture();
  const result = release(f, options(f));
  expect(result.failed, result.diagnostics).toBe(true);
  expect(result.commands.map(({ command }) => command)).toEqual([
    ...validationCommands,
    ledgerQuery,
  ]);
  expect(result.summary).toContain("Migration readiness: failure");
  expect(result.summary).toContain("API: skipped");
  expect(result.summary).toContain("Portal: skipped");
});

it("a failed API deploy skips the portal, flags uncertain outcomes, and a retry revalidates the SHA", () => {
  const f = fixture();
  const result = release(f, { fail: apiDeploy });
  expect(result.failed, result.diagnostics).toBe(true);
  expect(result.commands.at(-1).command).toBe(apiDeploy);
  expect(result.summary).toContain("API: failure");
  expect(result.summary).toContain("Portal: skipped");
  expect(result.summary).toContain("uncertain remote outcomes");
  writeFileSync(f.log, "");
  const retry = release(f);
  expect(retry.failed, retry.diagnostics).toBe(false);
  expect(retry.commands.map(({ command }) => command).slice(0, validationCommands.length)).toEqual(
    validationCommands,
  );
  expect(retry.commands.every(({ sha }) => sha === f.sha)).toBe(true);
});
