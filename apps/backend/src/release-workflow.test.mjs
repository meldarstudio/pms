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
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vite-plus/test";

const repo = fileURLToPath(new URL("../../../", import.meta.url));
// Reuse the YAML parser already installed through the portal's shadcn tooling.
const portalRequire = createRequire(join(repo, "apps/portal/package.json"));
const shadcnRequire = createRequire(portalRequire.resolve("shadcn"));
const cosmiconfigRequire = createRequire(shadcnRequire.resolve("cosmiconfig"));
const { load } = cosmiconfigRequire("js-yaml");
const temporaryDirs = [];

afterEach(() => {
  for (const directory of temporaryDirs.splice(0)) rmSync(directory, { recursive: true });
});

function git(cwd, ...args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

function fixture(changeSelectedCheckout = () => {}) {
  const directory = mkdtempSync(join(tmpdir(), "pms-release-test-"));
  temporaryDirs.push(directory);
  const cwd = join(directory, "checkout");
  mkdirSync(join(cwd, "apps/backend"), { recursive: true });
  for (const name of ["scripts", "drizzle", "wrangler.jsonc"]) {
    cpSync(join(repo, "apps/backend", name), join(cwd, "apps/backend", name), {
      recursive: true,
    });
  }
  cpSync(join(repo, "package.json"), join(cwd, "package.json"));
  cpSync(join(repo, ".node-version"), join(cwd, ".node-version"));
  changeSelectedCheckout(cwd);
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
const args = process.argv.slice(2);
const command = args.join(' ');
if (command === 'install --frozen-lockfile' && process.env.ADVANCE_MAIN === 'true') {
  const result = spawnSync('git', ['update-ref', 'refs/remotes/origin/main', 'main']);
  if (result.status !== 0) process.exit(93);
}
appendFileSync(process.env.COMMAND_LOG, JSON.stringify({
  command,
  sha: spawnSync('git', ['rev-parse', 'HEAD'], {encoding:'utf8'}).stdout.trim(),
  source: readFileSync('revision.txt', 'utf8'),
  token: process.env.CLOUDFLARE_API_TOKEN ?? null,
  account: process.env.CLOUDFLARE_ACCOUNT_ID ?? null,
  origin: process.env.VITE_API_BASE_URL ?? null,
}) + '\\n');
if (command.includes(process.env.FAIL_COMMAND || '__no_failure__')) process.exit(1);
if (command.includes('d1 execute')) {
  if (args.includes('--command') && args[args.indexOf('--command') + 1] === 'SELECT id, name FROM d1_migrations ORDER BY id') {
    process.stdout.write(process.env.LEDGER);
  } else process.exit(91);
} else if (![
  'install --frozen-lockfile', 'check', 'test', 'build',
  '--filter @pms/backend run deploy:ci', '--filter @pms/portal run deploy',
].includes(command)) process.exit(92);
`,
    { mode: 0o755 },
  );
  const names = JSON.parse(
    readFileSync(join(cwd, "apps/backend/drizzle/meta/_journal.json"), "utf8"),
  ).entries.map((entry) => `${entry.tag}.sql`);
  const ledger = [{ success: true, results: names.map((name, i) => ({ id: i + 1, name })) }];
  return { cwd, sha, unmerged, bin, log, ledger, directory };
}

// Execute the actual workflow's run blocks. External actions (checkout and runtime
// setup) are represented by the local checkout and pinned runtime running this test.
// Only GitHub's default success gate and always() are needed; reject other semantics.
function release(f, options = {}) {
  const workflow = load(readFileSync(join(repo, ".github/workflows/release.yml"), "utf8"));
  const context = {
    "inputs.commit_sha": options.sha ?? f.sha,
    "secrets.CLOUDFLARE_ACCOUNT_ID": options.account ?? "simulated-account",
    "secrets.CLOUDFLARE_READ_TOKEN": options.readToken ?? "simulated-read-token",
    "secrets.CLOUDFLARE_DEPLOY_TOKEN": "simulated-deploy-token",
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
  for (const [index, step] of workflow.jobs.release.steps.entries()) {
    if (step.if && step.if !== "always()") throw new Error(`Unsupported condition: ${step.if}`);
    const id = step.id ?? `step${index}`;
    context[`steps.${id}.outcome`] = "skipped";
    if (failed && step.if !== "always()") continue;
    if (step.uses?.startsWith("actions/checkout@")) {
      git(f.cwd, "checkout", "--detach", interpolate(step.with?.ref ?? "main"));
      continue;
    }
    if (!step.run) continue;
    const result = spawnSync("bash", ["--noprofile", "--norc", "-eo", "pipefail", "-c", step.run], {
      cwd: f.cwd,
      encoding: "utf8",
      env: {
        PATH: `${f.bin}:${process.env.PATH}`,
        HOME: f.directory,
        CI: "true",
        GITHUB_REF: options.ref ?? "refs/heads/main",
        GITHUB_STEP_SUMMARY: summary,
        COMMAND_LOG: f.log,
        LEDGER:
          typeof options.ledger === "string"
            ? options.ledger
            : JSON.stringify(options.ledger ?? f.ledger),
        FAIL_COMMAND: options.fail ?? "",
        ADVANCE_MAIN: String(options.advanceMain ?? false),
        ...Object.fromEntries(
          Object.entries(workflow.env ?? {}).map(([k, v]) => [k, interpolate(v)]),
        ),
        ...Object.fromEntries(
          Object.entries(workflow.jobs.release.env ?? {}).map(([k, v]) => [k, interpolate(v)]),
        ),
        ...Object.fromEntries(Object.entries(step.env ?? {}).map(([k, v]) => [k, interpolate(v)])),
      },
    });
    diagnostics += result.stdout + result.stderr;
    context[`steps.${id}.outcome`] = result.status === 0 ? "success" : "failure";
    if (result.status !== 0 && !step["continue-on-error"]) failed = true;
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
  expect(result.commands.map((entry) => entry.command)).toEqual([
    "install --frozen-lockfile",
    "check",
    "test",
    "build",
    "--filter @pms/backend exec wrangler d1 execute DB --remote --json --command SELECT id, name FROM d1_migrations ORDER BY id --config wrangler.jsonc",
    "--filter @pms/backend run deploy:ci",
    "--filter @pms/portal run deploy",
  ]);
  for (const command of result.commands) {
    expect(command.sha).toBe(f.sha);
    expect(command.source).toBe("selected release");
  }
  expect(result.commands.slice(0, 4).map(({ token, account }) => ({ token, account }))).toEqual(
    Array(4).fill({ token: null, account: null }),
  );
  expect(result.commands[3].origin).toBe("https://api.hotelmanantialchurin.com");
  expect(result.commands.slice(4).map(({ token }) => token)).toEqual([
    "simulated-read-token",
    "simulated-deploy-token",
    "simulated-deploy-token",
  ]);
  expect(result.summary).toContain(f.sha);
  expect(result.summary).toContain("API: success");
  expect(result.summary).toContain("Portal: success");
  expect(result.summary).toContain("not yet verified");
});

it.each([
  ["malformed", "main", "refs/heads/main"],
  ["unavailable", "a".repeat(40), "refs/heads/main"],
  ["unmerged", "unmerged", "refs/heads/main"],
  ["dispatch outside main", "selected", "refs/heads/unmerged"],
])("rejects %s source before validation or production access", (_, revision, ref) => {
  const f = fixture();
  const sha = revision === "unmerged" ? f.unmerged : revision === "selected" ? f.sha : revision;
  const result = release(f, { sha, ref });
  expect(result.failed, result.diagnostics).toBe(true);
  expect(result.commands).toEqual([]);
  expect(result.summary).toContain("Source accepted: failure");
  expect(result.summary).toContain("API: skipped");
  expect(result.summary).toContain("Portal: skipped");
});

it.each(["install --frozen-lockfile", "check", "test", "build"])(
  "a failed %s prevents production queries and both deployments",
  (fail) => {
    const result = release(fixture(), { fail });
    expect(result.failed, result.diagnostics).toBe(true);
    expect(result.commands.at(-1).command).toBe(fail);
    expect(result.commands.every(({ token, account }) => token === null && account === null)).toBe(
      true,
    );
    expect(result.summary).toContain("API: skipped");
    expect(result.summary).toContain("Portal: skipped");
  },
);

it.each([
  ["API", "--filter @pms/backend run deploy:ci", "failure", "skipped"],
  ["portal", "--filter @pms/portal run deploy", "success", "failure"],
])(
  "a failed %s records partial outcomes and retry still validates the requested SHA",
  (_, fail, api, portal) => {
    const f = fixture();
    const result = release(f, { fail });
    expect(result.failed, result.diagnostics).toBe(true);
    expect(result.commands.at(-1).command).toBe(fail);
    expect(result.summary).toContain(`API: ${api}`);
    expect(result.summary).toContain(`Portal: ${portal}`);
    expect(result.summary).toContain("uncertain remote outcomes");
    writeFileSync(f.log, "");
    const retry = release(f);
    expect(retry.failed, retry.diagnostics).toBe(false);
    expect(retry.commands.map(({ command }) => command).slice(0, 4)).toEqual([
      "install --frozen-lockfile",
      "check",
      "test",
      "build",
    ]);
    expect(retry.commands.every(({ sha }) => sha === f.sha)).toBe(true);
  },
);

it.each([
  ["pending", (rows) => rows.slice(0, -1)],
  ["newer", (rows) => [...rows, { id: 5, name: "0004_future.sql" }]],
  ["different", (rows) => [{ id: 1, name: "0000_other.sql" }, ...rows.slice(1)]],
  ["out of order", (rows) => [rows[1], rows[0], ...rows.slice(2)]],
  ["nonsequential", (rows) => rows.map((row, i) => ({ ...row, id: i + 2 }))],
  ["duplicate", (rows) => [rows[0], rows[0], ...rows.slice(2)]],
  ["empty", () => []],
  ["malformed row", (rows) => [null, ...rows.slice(1)]],
])(
  "blocks %s production history at the release boundary without database writes",
  (_, transform) => {
    const f = fixture();
    const result = release(f, {
      ledger: [{ success: true, results: transform(f.ledger[0].results) }],
    });
    expect(result.failed, result.diagnostics).toBe(true);
    expect(result.commands.slice(4).map(({ command }) => command)).toEqual([
      "--filter @pms/backend exec wrangler d1 execute DB --remote --json --command SELECT id, name FROM d1_migrations ORDER BY id --config wrangler.jsonc",
    ]);
    expect(result.summary).toContain("Migration readiness: failure");
    expect(result.summary).toContain("API: skipped");
    expect(result.summary).toContain("Portal: skipped");
  },
);

it.each([
  ["missing ledger / failed query", undefined, "d1 execute"],
  ["non-JSON", "not JSON", undefined],
  ["no query envelope", [], undefined],
  ["failed query envelope", [{ success: false, results: [] }], undefined],
  ["malformed query envelope", [{ success: true, results: {} }], undefined],
  [
    "extra query results",
    [
      { success: true, results: [] },
      { success: true, results: [] },
    ],
    undefined,
  ],
])("fails closed for %s without attempting recovery", (_, ledger, fail) => {
  const result = release(fixture(), { ledger, fail });
  expect(result.failed, result.diagnostics).toBe(true);
  expect(result.commands).toHaveLength(5);
  expect(result.summary).toContain("API: skipped");
  expect(result.summary).toContain("Portal: skipped");
});

it("rejects an unregistered SQL file even when production matches the journal", () => {
  const f = fixture((cwd) => {
    writeFileSync(join(cwd, "apps/backend/drizzle/0004_unregistered.sql"), "SELECT 1;");
  });
  const result = release(f);
  expect(result.failed, result.diagnostics).toBe(true);
  expect(result.commands).toHaveLength(4);
  expect(result.summary).toContain("API: skipped");
});

it("restricts dispatch, repository authority, credential exposure, and active release concurrency", () => {
  const workflow = load(readFileSync(join(repo, ".github/workflows/release.yml"), "utf8"));
  expect(Object.keys(workflow.on)).toEqual(["workflow_dispatch"]);
  expect(workflow.permissions).toEqual({ contents: "read" });
  expect(workflow.concurrency["cancel-in-progress"]).toBe(false);
  expect(workflow.concurrency.group).toBeTypeOf("string");
  expect(workflow.concurrency.group).not.toContain("${{");
  const steps = workflow.jobs.release.steps;
  const checkout = steps.find((step) => step.uses?.startsWith("actions/checkout@"));
  expect(checkout.with["persist-credentials"]).toBe(false);
  expect(checkout.with["fetch-depth"]).toBe(0);
  const pnpm = steps.find((step) => step.uses?.startsWith("pnpm/action-setup@"));
  expect(pnpm.with.run_install).toBe(false);
  expect(pnpm.with.version).toBeUndefined(); // Version comes from selected packageManager.
  const node = steps.find((step) => step.uses?.startsWith("actions/setup-node@"));
  expect(node.with["node-version-file"]).toBe(".node-version");
  // Actions do not execute through our command simulator; protect this credential
  // boundary explicitly, including accidental job/workflow-level credentials.
  for (const settings of [workflow, workflow.jobs.release, ...steps.filter((step) => step.uses)]) {
    expect(JSON.stringify(settings.env ?? {})).not.toContain("secrets.");
    expect(JSON.stringify(settings.with ?? {})).not.toContain("secrets.");
  }
});

it.each([
  ["read token", { readToken: "" }],
  ["account identifier", { account: "" }],
])("missing %s blocks production access and deployment", (_, credentials) => {
  const result = release(fixture(), credentials);
  expect(result.failed, result.diagnostics).toBe(true);
  expect(result.commands).toHaveLength(4);
  expect(result.summary).toContain("Migration readiness: failure");
  expect(result.summary).toContain("API: skipped");
});
