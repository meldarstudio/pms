import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { productionTarget, readMigrationManifest } from "./production-migrations.mjs";

// The release may deploy only when production has applied exactly the selected
// commit's registered migrations: none pending, none newer, none different.
// `response` is the parsed `wrangler d1 execute --json` output of the ledger query.
export function checkLedger(names, response) {
  if (
    !Array.isArray(response) ||
    response.length !== 1 ||
    response[0].success !== true ||
    !Array.isArray(response[0].results) ||
    !names.length ||
    response[0].results.length !== names.length ||
    response[0].results.some((row, index) => row.id !== index + 1 || row.name !== names[index])
  ) {
    throw new Error("Production migration history does not exactly match the selected commit");
  }
}

// This guard deliberately has no migration, bootstrap, or repair path.
async function main() {
  const repo = fileURLToPath(new URL("../../../", import.meta.url));
  try {
    const { unstable_readConfig: readConfig } = await import("wrangler");
    const backend = resolve(repo, "apps/backend");
    const config = readConfig(
      { config: resolve(backend, "wrangler.jsonc") },
      { hideWarnings: true },
    );
    const database = productionTarget(config);
    const migrations = resolve(backend, database.migrations_dir ?? "migrations");
    const { names } = readMigrationManifest(migrations);
    if (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_API_TOKEN) {
      throw new Error("Cloudflare readiness credentials are missing");
    }
    const query = spawnSync(
      "pnpm",
      [
        "--filter",
        "@pms/backend",
        "exec",
        "wrangler",
        "d1",
        "execute",
        "DB",
        "--remote",
        "--json",
        "--command",
        "SELECT id, name FROM d1_migrations ORDER BY id",
        "--config",
        "wrangler.jsonc",
      ],
      { cwd: repo, encoding: "utf8", maxBuffer: 1024 * 1024 },
    );
    if (query.error || query.status !== 0) throw new Error("Production ledger query failed");
    checkLedger(names, JSON.parse(query.stdout));
    console.log(`Production migration history matches all ${names.length} registered migrations.`);
  } catch (error) {
    console.error(
      `${error.message}. Stop and investigate; no database changes or deployments authorized.`,
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
