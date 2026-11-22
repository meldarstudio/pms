import config from "../cloudflare.config.ts";
import { applyMigrations, executeSql, localDatabase, queryRows } from "./d1.mjs";
import { seedLocalOwner } from "./local-owner.mjs";
import { buildResetSql, referenceDate } from "./seed-data.mjs";
import { buildSchemaResetSql, schemaObjectsSql } from "./schema-reset.mjs";

function propertyToday() {
  const timeZone = config.worker.env.PROPERTY_TIME_ZONE.value;
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    console.log(
      "Usage: pnpm db:reset:local [--date=YYYY-MM-DD] [--persist-to=PATH] [--rebuild-schema]",
    );
    console.log("Replaces application data with dummy data. Defaults to today at the property.");
    console.log(
      "--rebuild-schema also replaces application tables, triggers, and migration history.",
    );
    return;
  }
  const options = new Map();
  for (let index = 0; index < args.length; index++) {
    const [option, ...parts] = args[index].split("=");
    if (!["--date", "--persist-to", "--rebuild-schema"].includes(option))
      throw new Error(`Unknown option: ${option}`);
    if (options.has(option)) throw new Error(`Duplicate option: ${option}`);
    if (option === "--rebuild-schema") {
      if (parts.length) throw new Error(`Unknown option: ${args[index]}`);
      options.set(option, true);
      continue;
    }
    const value = parts.length ? parts.join("=") : args[++index];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${option}`);
    options.set(option, value);
  }
  const anchor = referenceDate(options.get("--date") ?? propertyToday());
  const persistTo = options.get("--persist-to");
  const target = localDatabase(persistTo);
  if (options.has("--rebuild-schema")) {
    console.log("Rebuilding PMS application schema and migration history.");
    executeSql(target, buildSchemaResetSql(queryRows(target, schemaObjectsSql)));
  }
  console.log(`Replacing local PMS data with sample data around ${anchor}.`);
  applyMigrations(target);
  executeSql(target, buildResetSql(anchor, queryRows(target, schemaObjectsSql)));
  await seedLocalOwner(persistTo);
  console.log("Local database reset. Refresh the portal to load the sample data.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
