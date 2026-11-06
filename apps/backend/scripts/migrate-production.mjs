import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  createReadStream,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, hostname, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import {
  MIGRATIONS_DIR,
  productionTarget,
  readMigrationManifest,
} from "./production-migrations.mjs";

const backendDir = fileURLToPath(new URL("..", import.meta.url));
const configPath = join(backendDir, "cloudflare.config.ts");
const productionName = "pms-production";
const backupRoot = join(homedir(), ".pms-production-backups");
const lockPath = join(backupRoot, "migration.lock");
const abort = new AbortController();
let child;
let report;
let reportPath;

function redact(text) {
  return String(text).replace(/https?:\/\/[^\s"'<>]+/g, "[URL redacted]");
}

function saveReport() {
  if (reportPath)
    writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
}

function checkInterrupted() {
  if (abort.signal.aborted) throw new Error("Interrupted; no further migrations will be attempted");
}

function stopChild(signal) {
  if (child?.pid) {
    try {
      process.kill(-child.pid, signal);
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  }
}

async function run(tool, args, quiet = false) {
  checkInterrupted();
  const result = await new Promise((resolveResult) => {
    let stdout = "";
    let stderr = "";
    let failure;
    child = spawn("pnpm", ["exec", tool, ...args], {
      cwd: backendDir,
      env: {
        ...process.env,
        CI: "true",
        CF_SEND_TELEMETRY: "false",
        WRANGLER_WRITE_LOGS: "false",
        WRANGLER_SEND_METRICS: "false",
        WRANGLER_LOG_SANITIZE: "true",
        WRANGLER_LOG: quiet ? "warn" : "log",
      },
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });
    function collect(stream, chunk) {
      if (failure) return;
      if (stream === "stdout") stdout += chunk;
      else stderr += chunk;
      if (stdout.length + stderr.length > 16 * 1024 * 1024) {
        failure = new Error(`${tool} output exceeded the safety limit`);
        stopChild("SIGTERM");
      }
    }
    child.stdout.setEncoding("utf8").on("data", (chunk) => collect("stdout", chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk) => collect("stderr", chunk));
    child.on("error", (error) => {
      failure = error;
    });
    child.on("close", (status, signal) => {
      child = undefined;
      resolveResult({ stdout, stderr, status, signal, failure });
    });
  });
  const isQuery = args[1] === "query";
  if (report) {
    report.diagnostics.push({
      command: [tool, ...args.slice(0, 2)].join(" "),
      status: result.status,
      signal: result.signal,
      stderr: redact(result.stderr),
      stdout: isQuery && result.status === 0 ? undefined : redact(result.stdout),
    });
    saveReport();
  }
  if (result.stderr) process.stderr.write(redact(result.stderr));
  if (!isQuery && result.stdout) process.stdout.write(redact(result.stdout));
  checkInterrupted();
  if (result.failure || result.status !== 0) {
    if (isQuery && result.stdout) process.stderr.write(redact(result.stdout));
    throw new Error(
      result.failure?.message ??
        `${tool} failed with ${result.signal ? `signal ${result.signal}` : `exit code ${result.status}`}`,
    );
  }
  return result.stdout;
}

async function query(databaseId, sql) {
  const output = await run("cf", ["d1", "query", databaseId, "--sql", sql]);
  let results;
  try {
    results = JSON.parse(output);
  } catch {
    throw new Error("cf returned invalid query JSON; database state is unknown");
  }
  if (
    !Array.isArray(results) ||
    results.length !== 1 ||
    results[0].success !== true ||
    !Array.isArray(results[0].results)
  ) {
    throw new Error("Cannot verify query results; database state is unknown");
  }
  return results[0].results;
}

async function readHistory(databaseId) {
  const tables = await query(
    databaseId,
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'd1_migrations'",
  );
  if (tables.length !== 1)
    throw new Error("Missing migration ledger; bootstrap is a separate operation");
  const rows = await query(databaseId, "SELECT name FROM d1_migrations ORDER BY id");
  if (!rows.length || rows.some((row) => typeof row.name !== "string")) {
    throw new Error("Empty or invalid migration ledger; history repair is a separate operation");
  }
  return rows.map((row) => row.name);
}

function readPlan(migrationsDir) {
  const manifest = readMigrationManifest(migrationsDir);
  const files = manifest.files.map(({ name, sql }) => ({
    name,
    sql,
    sha256: createHash("sha256").update(sql).digest("hex"),
  }));
  return {
    config: readFileSync(configPath, "utf8"),
    journalText: manifest.journalText,
    files,
    names: manifest.names,
  };
}

function validateHistory(history, names) {
  if (history.length > names.length || history.some((name, index) => name !== names[index])) {
    throw new Error(
      "Unknown or nonsequential migration history; history repair is a separate operation",
    );
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    console.log("Usage: pnpm --filter @pms/backend run db:migrate:remote");
    console.log("Interactive production migration only. No options or unattended bypass.");
    console.log(`Private backups and reports: ${backupRoot}`);
    return;
  }
  if (args.length) throw new Error("Unknown arguments; use --help");
  if (
    !process.stdin.isTTY ||
    !process.stdout.isTTY ||
    (process.env.CI && process.env.CI !== "false")
  ) {
    throw new Error("Production migrations require an interactive terminal outside CI");
  }
  process.umask(0o077);
  const { default: config } = await import("../cloudflare.config.ts");
  const database = productionTarget(config);
  const migrationsDir = resolve(backendDir, MIGRATIONS_DIR);
  const plan = readPlan(migrationsDir);
  mkdirSync(backupRoot, { recursive: true, mode: 0o700 });
  const rootStat = lstatSync(backupRoot);
  if (
    !rootStat.isDirectory() ||
    rootStat.uid !== process.getuid() ||
    (rootStat.mode & 0o077) !== 0
  ) {
    throw new Error(`Backup directory must be owned by you with permissions 0700: ${backupRoot}`);
  }
  let lock;
  try {
    lock = openSync(lockPath, "wx", 0o600);
  } catch (error) {
    if (error.code === "EEXIST") {
      throw new Error(
        `Migration lock exists: ${lockPath}. Check its operator and process before removing it`,
      );
    }
    throw error;
  }
  let temporaryDir;
  try {
    writeFileSync(
      lock,
      JSON.stringify({ pid: process.pid, host: hostname(), started: new Date().toISOString() }),
    );
    closeSync(lock);
    lock = undefined;
    temporaryDir = mkdtempSync(join(tmpdir(), "pms-migrate-"));
    const snapshotDir = join(temporaryDir, "migrations");
    mkdirSync(snapshotDir, { mode: 0o700 });
    const wranglerExportConfig = join(temporaryDir, "wrangler.json");
    writeFileSync(
      wranglerExportConfig,
      JSON.stringify({
        name: config.worker.name,
        account_id: config.accountId,
        compatibility_date: config.worker.compatibilityDate,
        d1_databases: [{ binding: "DB", database_name: database.name, database_id: database.id }],
      }),
      { mode: 0o600 },
    );
    const before = await readHistory(database.id);
    validateHistory(before, plan.names);
    const pending = plan.files.slice(before.length);
    if (!pending.length) {
      console.log("No pending production migrations. No backup or database changes performed.");
      return;
    }
    console.log(`Target: ${productionName} (${database.id})`);
    console.log(`Account: ${config.accountId ?? "cf authenticated account"}`);
    for (const file of pending)
      console.log(`\n--- ${file.name} | SHA-256 ${file.sha256} ---\n${file.sql}`);
    console.log("\nExport will interrupt database access; migration may also interrupt requests.");
    console.log(
      "Review SQL for data loss and compatibility. Destructive changes need separate approval and a recovery plan.",
    );
    console.log("Only one operator may migrate at a time, including on other machines.");
    console.log("No automatic restore or retry. The SQL export will not be restore-tested.");
    const terminal = createInterface({ input: process.stdin, output: process.stdout });
    const cancelOnClose = () => abort.abort();
    terminal.once("close", cancelOnClose);
    let answer;
    try {
      answer = await terminal.question(
        `Type ${productionName} to approve this SQL, the backup, and downtime: `,
        { signal: abort.signal },
      );
    } finally {
      terminal.off("close", cancelOnClose);
      terminal.close();
    }
    if (answer !== productionName)
      throw new Error("Approval did not match; no backup or migrations performed");
    const assertPlanUnchanged = () => {
      checkInterrupted();
      if (JSON.stringify(readPlan(migrationsDir)) !== JSON.stringify(plan)) {
        throw new Error("Local configuration or migrations changed; review and approve a new run");
      }
    };
    const assertHistoryUnchanged = async (expected) => {
      const actual = await readHistory(database.id);
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error("Remote migration history changed; stop and investigate before a new run");
      }
      return actual;
    };
    assertPlanUnchanged();
    await assertHistoryUnchanged(before);
    const backupDir = mkdtempSync(
      join(backupRoot, `${new Date().toISOString().replaceAll(":", "-")}-`),
    );
    const backupPath = join(backupDir, "database.sql");
    reportPath = join(backupDir, "report.json");
    report = {
      target: { name: productionName, id: database.id, account: config.accountId },
      started: new Date().toISOString(),
      status: "exporting",
      before,
      planned: pending.map(({ name, sha256 }) => ({ name, sha256 })),
      backup: { path: backupPath },
      diagnostics: [],
    };
    saveReport();
    console.log(`Private backup and report: ${backupDir}`);
    writeFileSync(backupPath, "", { flag: "wx", mode: 0o600 });
    await run(
      "wrangler",
      [
        "d1",
        "export",
        productionName,
        "--remote",
        "--output",
        backupPath,
        "--skip-confirmation",
        "--config",
        wranglerExportConfig,
      ],
      true,
    );
    if (!lstatSync(backupPath).isFile() || lstatSync(backupPath).size === 0) {
      throw new Error("Export is missing or empty; no migrations attempted");
    }
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(backupPath)) hash.update(chunk);
    report.backup.sha256 = hash.digest("hex");
    console.log(`Export complete (not restore-tested). SHA-256: ${report.backup.sha256}`);
    report.status = "backup-complete";
    saveReport();
    let expected = before;
    try {
      for (const file of pending) {
        assertPlanUnchanged();
        await assertHistoryUnchanged(expected);
        writeFileSync(join(snapshotDir, file.name), file.sql, { flag: "wx", mode: 0o400 });
        report.status = "applying";
        report.attempting = file.name;
        saveReport();
        await run("cf", ["d1", "migrations", "apply", database.id, "--dir", snapshotDir]);
        expected = [...expected, file.name];
        report.after = await assertHistoryUnchanged(expected);
        saveReport();
      }
    } catch (error) {
      try {
        report.after = await readHistory(database.id);
        report.applied = report.after.filter((name) => !before.includes(name));
        report.status = "failed";
        console.error(
          `Ledger records these new migrations: ${report.applied.join(", ") || "none"}`,
        );
      } catch {
        report.status = "unknown";
        console.error(
          "Postflight could not determine database state. Do not rerun or restore blindly.",
        );
      }
      throw error;
    }
    report.status = "succeeded";
    report.applied = pending.map((file) => file.name);
    report.finished = new Date().toISOString();
    delete report.attempting;
    saveReport();
    console.log(
      `Verified ${report.applied.length} migration(s); no pending migrations. No code deployed.`,
    );
  } finally {
    if (lock !== undefined) closeSync(lock);
    if (temporaryDir) rmSync(temporaryDir, { recursive: true, force: true });
    unlinkSync(lockPath);
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    abort.abort();
    stopChild(signal);
  });
}

try {
  await main();
} catch (error) {
  const message = redact(error instanceof Error ? error.message : error);
  console.error(message);
  if (report) {
    if (!["failed", "unknown"].includes(report.status)) {
      report.status = report.attempting ? "unknown" : "failed-before-apply";
    }
    report.error = message;
    saveReport();
    console.error(`Private report: ${reportPath}`);
  }
  process.exitCode = 1;
}
