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
import { afterEach, expect, it } from "vite-plus/test";

const repo = fileURLToPath(new URL("../../../", import.meta.url));
const actions = {
  checkout: "actions/checkout@v7",
  pnpm: "pnpm/action-setup@v6",
  node: "actions/setup-node@v7",
};
const temporaryDirs = [];
const validationCommands = [
  "install --frozen-lockfile",
  "check",
  "test",
  "build",
  "--filter @pms/backend exec wrangler deploy --dry-run --minify",
];

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
  // Keep this existing harness focused on pre-deploy safety and sequencing.
  // HTTP smoke behavior has its own local-server tests; do not emulate live
  // Cloudflare deployment status or contact production from this fixture.
  for (const name of ["smoke-production.mjs", "record-production-release.mjs"]) {
    writeFileSync(
      join(cwd, "apps/backend/scripts", name),
      "// External post-deployment boundary excluded from this harness.\n",
    );
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
  writeFileSync(join(cwd, ".node-version"), "99.0.0\n");
  const laterPackage = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));
  laterPackage.packageManager = "pnpm@99.0.0";
  writeFileSync(join(cwd, "package.json"), JSON.stringify(laterPackage));
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
  '--filter @pms/backend exec wrangler deploy --dry-run --minify',
  '--filter @pms/backend run deploy', '--filter @pms/portal run deploy',
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

// This is deliberately not an Actions emulator. Before executing real run blocks,
// reject execution settings/actions we don't model, including on skipped steps.
function supportedWorkflow(workflow) {
  const onlyKeys = (settings, keys) => {
    for (const key of Object.keys(settings ?? {})) {
      if (!keys.includes(key)) throw new Error(`Unsupported workflow setting: ${key}`);
    }
  };
  const defaults = (settings) => {
    onlyKeys(settings, ["run"]);
    onlyKeys(settings?.run, ["shell"]);
    if (settings?.run?.shell && settings.run.shell !== "bash")
      throw new Error(`Unsupported shell: ${settings.run.shell}`);
  };
  onlyKeys(workflow, ["name", "on", "permissions", "concurrency", "env", "defaults", "jobs"]);
  onlyKeys(workflow.jobs, ["release"]);
  const job = workflow.jobs.release;
  onlyKeys(job, ["runs-on", "env", "defaults", "steps"]);
  if (job["runs-on"] !== "ubuntu-24.04") throw new Error("Unsupported runner");
  defaults(workflow.defaults);
  defaults(job.defaults);
  const pnpm = job.steps.findIndex((step) => step.uses === actions.pnpm);
  const node = job.steps.findIndex((step) => step.uses === actions.node);
  const install = job.steps.findIndex((step) => step.run === "pnpm install --frozen-lockfile");
  if (pnpm < 0 || node <= pnpm || install <= node)
    throw new Error("Unsupported runtime setup order before frozen installation");
  for (const step of job.steps) {
    onlyKeys(step, ["name", "id", "if", "env", "uses", "with", "run", "shell"]);
    if (step.if !== undefined && step.if !== "always()")
      throw new Error(`Unsupported condition: ${step.if}`);
    if (step.run && !step.uses) {
      const shell = step.shell ?? job.defaults?.run?.shell ?? workflow.defaults?.run?.shell;
      if (shell !== "bash") throw new Error(`Unsupported shell: ${shell ?? "implicit default"}`);
      if (step.with) throw new Error("Unsupported run step inputs");
    } else if (step.uses && !step.run && step.shell === undefined && step.env === undefined) {
      const inputs = {
        [actions.checkout]: ["ref", "fetch-depth", "persist-credentials"],
        [actions.pnpm]: ["run_install"],
        [actions.node]: ["node-version-file", "cache"],
      }[step.uses];
      if (!inputs) throw new Error(`Unsupported action: ${step.uses}`);
      onlyKeys(step.with, inputs);
      if (step.uses === actions.pnpm && step.with?.run_install !== false)
        throw new Error(
          "Unsupported pnpm runtime setup: dependency installation must remain separate",
        );
      if (
        step.uses === actions.node &&
        (step.with?.["node-version-file"] !== ".node-version" || step.with?.cache !== "pnpm")
      )
        throw new Error("Unsupported Node runtime setup");
    } else throw new Error("Unsupported workflow step");
  }
}

// External actions are narrowly represented by a local checkout and runtime
// setup checks. Only the default success gate and always() are supported.
function release(f, options = {}) {
  const workflow = load(readFileSync(join(repo, ".github/workflows/release.yml"), "utf8"));
  options.changeWorkflow?.(workflow);
  supportedWorkflow(workflow);
  const context = {
    "inputs.commit_sha": options.sha ?? f.sha,
    "secrets.CLOUDFLARE_ACCOUNT_ID": options.account ?? "simulated-account",
    "secrets.CLOUDFLARE_READ_TOKEN": options.readToken ?? "simulated-read-token",
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
  for (const [index, step] of workflow.jobs.release.steps.entries()) {
    const id = step.id ?? `step${index}`;
    context[`steps.${id}.outcome`] = "skipped";
    if (failed && step.if !== "always()") continue;
    if (step.uses === actions.checkout) {
      git(f.cwd, "checkout", "--detach", interpolate(step.with?.ref ?? "main"));
      continue;
    }
    if (step.uses === actions.pnpm) {
      const { packageManager } = JSON.parse(readFileSync(join(f.cwd, "package.json"), "utf8"));
      if (packageManager !== "pnpm@12.15.0")
        throw new Error("Unsupported pnpm runtime at selected checkout");
      continue;
    }
    if (step.uses === actions.node) {
      const version = readFileSync(join(f.cwd, step.with["node-version-file"]), "utf8").trim();
      if (version !== "22.23.4" || process.versions.node !== version)
        throw new Error("Unsupported Node runtime at selected checkout");
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
    if (result.status !== 0) failed = true;
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
    ...validationCommands,
    "--filter @pms/backend exec wrangler d1 execute DB --remote --json --command SELECT id, name FROM d1_migrations ORDER BY id --config wrangler.jsonc",
    "--filter @pms/backend run deploy",
    "--filter @pms/portal run deploy",
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
  expect(result.commands[3].origin).toBe("https://api.hotelmanantialchurin.com");
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

it.each([
  [
    "workflow working directory",
    (w) => {
      w.defaults = { run: { "working-directory": "apps/backend" } };
    },
  ],
  [
    "job working directory",
    (w) => {
      w.jobs.release.defaults.run["working-directory"] = "apps/backend";
    },
  ],
  [
    "step working directory",
    (w) => {
      w.jobs.release.steps.find((s) => s.run)["working-directory"] = "apps/backend";
    },
  ],
  [
    "workflow shell",
    (w) => {
      w.defaults = { run: { shell: "pwsh" } };
    },
  ],
  [
    "job shell",
    (w) => {
      w.jobs.release.defaults.run.shell = "sh";
    },
  ],
  [
    "step shell",
    (w) => {
      w.jobs.release.steps.find((s) => s.run).shell = "sh";
    },
  ],
  [
    "implicit shell",
    (w) => {
      delete w.jobs.release.defaults;
    },
  ],
  [
    "job condition",
    (w) => {
      w.jobs.release.if = "false";
    },
  ],
  [
    "job container",
    (w) => {
      w.jobs.release.container = "node:22";
    },
  ],
  [
    "step error bypass",
    (w) => {
      w.jobs.release.steps.find((s) => s.run)["continue-on-error"] = "true";
    },
  ],
  [
    "unknown action",
    (w) => {
      w.jobs.release.steps.push({ uses: "example/deploy@v1" });
    },
  ],
  [
    "unsupported action version",
    (w) => {
      w.jobs.release.steps[0].uses = "actions/checkout@v999";
    },
  ],
])(
  "the workflow harness rejects unsupported %s instead of silently simulating it",
  (_, changeWorkflow) => {
    const f = fixture();
    expect(() => release(f, { changeWorkflow })).toThrow(/Unsupported/);
    expect(readFileSync(f.log, "utf8")).toBe("");
  },
);

it.each([
  ["missing pnpm setup", (steps) => steps.filter((s) => s.uses !== actions.pnpm)],
  ["missing Node setup", (steps) => steps.filter((s) => s.uses !== actions.node)],
  [
    "setup after installation",
    (steps) => {
      const index = steps.findIndex((s) => s.uses === actions.node);
      steps.push(...steps.splice(index, 1));
      return steps;
    },
  ],
  [
    "runtime setup from advancing main",
    (steps) => {
      const source = steps.findIndex((s) => s.run);
      steps.splice(source + 2, 0, ...steps.splice(source, 1));
      return steps;
    },
  ],
  [
    "wrong Node version file",
    (steps) => {
      steps.find((s) => s.uses === actions.node).with["node-version-file"] = "other-version";
      return steps;
    },
  ],
  [
    "pnpm installing dependencies in setup",
    (steps) => {
      steps.find((s) => s.uses === actions.pnpm).with.run_install = true;
      return steps;
    },
  ],
])("the workflow harness rejects %s before dependency commands", (_, changeSteps) => {
  const f = fixture();
  expect(() =>
    release(f, {
      changeWorkflow: (w) => {
        w.jobs.release.steps = changeSteps(w.jobs.release.steps);
      },
    }),
  ).toThrow(/Unsupported|runtime/);
  expect(readFileSync(f.log, "utf8")).toBe("");
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

it.each(validationCommands)(
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
  ["API", "--filter @pms/backend run deploy", "failure", "skipped"],
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
    expect(
      retry.commands.map(({ command }) => command).slice(0, validationCommands.length),
    ).toEqual(validationCommands);
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
    expect(result.commands.slice(validationCommands.length).map(({ command }) => command)).toEqual([
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
  expect(result.commands).toHaveLength(validationCommands.length + 1);
  expect(result.summary).toContain("API: skipped");
  expect(result.summary).toContain("Portal: skipped");
});

it("rejects an unregistered SQL file even when production matches the journal", () => {
  const f = fixture((cwd) => {
    writeFileSync(join(cwd, "apps/backend/drizzle/0004_unregistered.sql"), "SELECT 1;");
  });
  const result = release(f);
  expect(result.failed, result.diagnostics).toBe(true);
  expect(result.commands).toHaveLength(validationCommands.length);
  expect(result.summary).toContain("API: skipped");
});

it.each([
  [
    "malformed identity",
    (text) => text.replace("17e838dd-b2f9-4783-ad9b-f5d837701428", "not-a-uuid"),
  ],
  [
    "duplicate target",
    (text) =>
      text.replace(
        '"d1_databases": [',
        '"d1_databases": [{"binding":"OTHER","database_name":"pms-production","database_id":"17e838dd-b2f9-4783-ad9b-f5d837701428"},',
      ),
  ],
  [
    "duplicate binding",
    (text) =>
      text.replace(
        '"d1_databases": [',
        '"d1_databases": [{"binding":"DB","database_name":"other","database_id":"17e838dd-b2f9-4783-ad9b-f5d837701428"},',
      ),
  ],
])("rejects production database %s before querying or deploying", (_, changeConfig) => {
  const f = fixture((cwd) => {
    const path = join(cwd, "apps/backend/wrangler.jsonc");
    writeFileSync(path, changeConfig(readFileSync(path, "utf8")));
  });
  const result = release(f);
  expect(result.failed, result.diagnostics).toBe(true);
  expect(result.commands).toHaveLength(validationCommands.length);
  expect(result.summary).toContain("Migration readiness: failure");
  expect(result.summary).toContain("API: skipped");
});

it.each(["invalid journal", "missing SQL", "empty SQL", "nonregular SQL", "out-of-order journal"])(
  "rejects %s before querying production",
  (kind) => {
    const f = fixture((cwd) => {
      const migrations = join(cwd, "apps/backend/drizzle");
      const journalPath = join(migrations, "meta/_journal.json");
      const journal = JSON.parse(readFileSync(journalPath, "utf8"));
      const sqlPath = join(migrations, `${journal.entries.at(-1).tag}.sql`);
      if (kind === "invalid journal") journal.entries[0].idx = 1;
      if (kind === "out-of-order journal") {
        journal.entries.reverse().forEach((entry, index) => {
          entry.idx = index;
        });
      }
      if (kind === "missing SQL" || kind === "nonregular SQL") rmSync(sqlPath);
      if (kind === "nonregular SQL") mkdirSync(sqlPath);
      if (kind === "empty SQL") writeFileSync(sqlPath, "\n");
      writeFileSync(journalPath, JSON.stringify(journal));
    });
    const result = release(f);
    expect(result.failed, result.diagnostics).toBe(true);
    expect(result.commands).toHaveLength(validationCommands.length);
    expect(result.summary).toContain("Migration readiness: failure");
  },
);

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
  expect(result.commands).toHaveLength(validationCommands.length);
  expect(result.summary).toContain("Migration readiness: failure");
  expect(result.summary).toContain("API: skipped");
});
