import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { productionTarget, readMigrationManifest } from "./production-migrations.mjs";

const backendDir = fileURLToPath(new URL("..", import.meta.url));
const productionName = "pms-production";
const envWithoutWranglerPrompts = {
  ...process.env,
  CI: "true",
  WRANGLER_WRITE_LOGS: "false",
  WRANGLER_SEND_METRICS: "false",
};

function wrangler(args, stdout = "inherit") {
  const result = spawnSync("pnpm", ["exec", "wrangler", "d1", ...args], {
    cwd: backendDir,
    encoding: "utf8",
    env: envWithoutWranglerPrompts,
    stdio: ["ignore", stdout, "inherit"],
  });
  if (result.status !== 0) throw new Error(`wrangler d1 ${args[0]} failed`);
  return result.stdout;
}

function readLedger() {
  const sql = "SELECT name FROM d1_migrations ORDER BY id";
  const output = wrangler(
    ["execute", productionName, "--remote", "--json", "--command", sql],
    "pipe",
  );
  return JSON.parse(output)[0].results.map((row) => row.name);
}

async function main() {
  const inCi = process.env.CI && process.env.CI !== "false";
  if (!process.stdin.isTTY || !process.stdout.isTTY || inCi) {
    throw new Error("Production migrations require an interactive terminal outside CI");
  }
  const { unstable_readConfig: readConfig } = await import("wrangler");
  const config = readConfig({ config: join(backendDir, "wrangler.jsonc") }, { hideWarnings: true });
  const database = productionTarget(config);
  const { files, names } = readMigrationManifest(resolve(backendDir, database.migrations_dir));

  const ledger = readLedger();
  if (!ledger.length || ledger.length > names.length || ledger.some((n, i) => n !== names[i])) {
    throw new Error("Production ledger is not a prefix of the registered migrations");
  }
  const pending = files.slice(ledger.length);
  if (!pending.length) return console.log("No pending production migrations.");

  for (const { name, sql } of pending) console.log(`\n--- ${name} ---\n${sql}`);
  console.log(`\nTarget: ${productionName} (${database.database_id})`);
  console.log("Migration may interrupt requests. Recovery is a Time Travel restore.");
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await terminal.question(`Type ${productionName} to apply this SQL: `);
  terminal.close();
  if (answer !== productionName) throw new Error("Approval did not match; nothing was changed");

  const timeTravel = wrangler(["time-travel", "info", productionName, "--json"], "pipe");
  const { bookmark } = JSON.parse(timeTravel);
  if (!bookmark) throw new Error("No Time Travel bookmark; no migrations were applied");
  const restore = `wrangler d1 time-travel restore ${productionName} --bookmark=${bookmark}`;
  console.log(`Restore point: ${restore}`);

  const report = () => {
    const applied = readLedger().slice(ledger.length);
    console.log(`Ledger records these new migrations: ${applied.join(", ") || "none"}`);
  };
  try {
    wrangler(["migrations", "apply", productionName, "--remote"]);
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
