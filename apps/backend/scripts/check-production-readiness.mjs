import { spawnSync } from "node:child_process";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// This guard deliberately has no migration, bootstrap, or repair path.
const repo = fileURLToPath(new URL("../../../", import.meta.url));
try {
  const { unstable_readConfig: readConfig } = await import("wrangler");
  const backend = resolve(repo, "apps/backend");
  const config = readConfig({ config: resolve(backend, "wrangler.jsonc") }, { hideWarnings: true });
  const database = config.d1_databases.find((item) => item.binding === "DB");
  if (
    config.name !== "pms-api" ||
    database?.database_name !== "pms-production" ||
    !database.database_id ||
    (database.migrations_table && database.migrations_table !== "d1_migrations") ||
    database.migrations_pattern
  )
    throw new Error("Unexpected production database configuration");
  const migrations = resolve(backend, database.migrations_dir ?? "migrations");
  const journal = JSON.parse(readFileSync(resolve(migrations, "meta/_journal.json"), "utf8"));
  const names = journal.entries.map((entry, index) => {
    if (entry.idx !== index || !/^\d{4}_[a-zA-Z0-9_]+$/.test(entry.tag)) {
      throw new Error("Invalid registered migration history");
    }
    return `${entry.tag}.sql`;
  });
  const sqlFiles = readdirSync(migrations).filter((name) => name.endsWith(".sql"));
  if (
    !names.length ||
    names.length !== sqlFiles.length ||
    names.some(
      (name, index) =>
        !sqlFiles.includes(name) ||
        (index > 0 && name <= names[index - 1]) ||
        !lstatSync(resolve(migrations, name)).isFile() ||
        !readFileSync(resolve(migrations, name), "utf8").trim(),
    )
  )
    throw new Error("Migration SQL and registered history disagree");
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
  const response = JSON.parse(query.stdout);
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
  console.log(`Production migration history matches all ${names.length} registered migrations.`);
} catch (error) {
  console.error(
    `${error.message}. Stop and investigate; no database changes or deployments authorized.`,
  );
  process.exitCode = 1;
}
