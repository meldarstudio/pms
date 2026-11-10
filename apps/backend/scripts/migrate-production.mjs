import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import {
  MIGRATIONS_DIR,
  productionTarget,
  readMigrationManifest,
} from "./production-migrations.mjs";

const backendDir = fileURLToPath(new URL("..", import.meta.url));
const productionName = "pms-production";
const envWithoutCfPrompts = {
  ...process.env,
  CI: "true",
};

function cf(args, stdout = "inherit") {
  const result = spawnSync("pnpm", ["exec", "cf", "d1", ...args], {
    cwd: backendDir,
    encoding: "utf8",
    env: envWithoutCfPrompts,
    stdio: ["ignore", stdout, "inherit"],
  });
  if (result.status !== 0) throw new Error(`cf d1 ${args[0]} failed`);
  return result.stdout;
}

function readLedger(databaseId) {
  const sql = "SELECT name FROM d1_migrations ORDER BY id";
  const output = cf(["query", databaseId, "--sql", sql], "pipe");
  return JSON.parse(output)[0].results.map((row) => row.name);
}

async function main() {
  const inCi = process.env.CI && process.env.CI !== "false";
  if (!process.stdin.isTTY || !process.stdout.isTTY || inCi) {
    throw new Error("Production migrations require an interactive terminal outside CI");
  }
  const { default: config } = await import("../cloudflare.config.ts");
  const database = productionTarget(config);
  const { files, names } = readMigrationManifest(resolve(backendDir, MIGRATIONS_DIR));

  const ledger = readLedger(database.id);
  if (!ledger.length || ledger.length > names.length || ledger.some((n, i) => n !== names[i])) {
    throw new Error("Production ledger is not a prefix of the registered migrations");
  }
  const pending = files.slice(ledger.length);
  if (!pending.length) return console.log("No pending production migrations.");

  for (const { name, sql } of pending) console.log(`\n--- ${name} ---\n${sql}`);
  console.log(`\nTarget: ${productionName} (${database.id})`);
  console.log(
    "Migration may interrupt requests. Prefer compatible code fallback or data-preserving forward correction.",
  );
  console.log(
    "A Time Travel restore can discard later reservations and payments; it requires separate explicit approval of the specific data loss.",
  );
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await terminal.question(`Type ${productionName} to apply this SQL: `);
  terminal.close();
  if (answer !== productionName) throw new Error("Approval did not match; nothing was changed");

  const timeTravel = cf(["time-travel", "get-bookmark", database.id], "pipe");
  const { bookmark } = JSON.parse(timeTravel);
  if (!bookmark) throw new Error("No Time Travel bookmark; no migrations were applied");
  console.log(
    `Emergency recovery reference: ${bookmark} (${database.id}); not restore authorization.`,
  );

  const report = () => {
    const applied = readLedger(database.id).slice(ledger.length);
    console.log(`Ledger records these new migrations: ${applied.join(", ") || "none"}`);
  };
  try {
    cf(["migrations", "apply", database.id, "--dir", MIGRATIONS_DIR]);
  } catch (error) {
    try {
      report();
    } catch {
      console.error("Could not read the ledger; database state is unknown. Do not rerun blindly.");
    }
    throw error;
  }
  report();
}

try {
  await main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
