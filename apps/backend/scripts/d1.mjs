import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import config from "../cloudflare.config.ts";
import { MIGRATIONS_DIR } from "./production-migrations.mjs";

const backendDir = fileURLToPath(new URL("..", import.meta.url));
const databaseId = config.worker.env.DB.id;

const wranglerDevServerState = join(backendDir, ".wrangler/state");

export function localDatabase(persistTo) {
  return ["--local", "--persist-to", persistTo ? resolve(persistTo) : wranglerDevServerState];
}
export const productionDatabase = [];

function runCf(args, captureOutput) {
  const result = spawnSync("pnpm", ["exec", "cf", ...args], {
    cwd: backendDir,
    stdio: captureOutput ? ["inherit", "pipe", "inherit"] : "inherit",
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (captureOutput && result.stdout) process.stderr.write(result.stdout);
    throw new Error(
      `cf failed${result.signal ? ` with signal ${result.signal}` : ` with exit code ${result.status}`}`,
    );
  }
  return result.stdout;
}

export function splitStatements(sql) {
  return (sql.match(/(?:[^;']+|'(?:[^']|'')*')+/g) ?? [])
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function runSql(target, sql) {
  const temporaryDir = mkdtempSync(join(tmpdir(), "pms-d1-"));
  try {
    const bodyPath = join(temporaryDir, "body.json");
    const batch = splitStatements(sql).map((statement) => ({ sql: statement }));
    writeFileSync(bodyPath, JSON.stringify({ batch }));
    const output = runCf(["d1", "raw", databaseId, ...target, "--body", `@${bodyPath}`], true);
    const results = JSON.parse(output);
    if (!Array.isArray(results) || !results.length || results.some((result) => !result.success))
      throw new Error("cf returned an unsuccessful D1 result");
    return results;
  } finally {
    rmSync(temporaryDir, { recursive: true, force: true });
  }
}

export function executeSql(target, sql) {
  runSql(target, sql);
}

export function queryRows(target, sql) {
  const [{ results }] = runSql(target, sql);
  return results.rows.map((row) =>
    Object.fromEntries(results.columns.map((column, index) => [column, row[index]])),
  );
}

export function applyMigrations(target) {
  runCf(["d1", "migrations", "apply", databaseId, ...target, "--dir", MIGRATIONS_DIR], false);
}
