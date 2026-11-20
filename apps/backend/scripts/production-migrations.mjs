import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const MIGRATIONS_DIR = "drizzle";
const productionDatabaseId = "17e838dd-b2f9-4783-ad9b-f5d837701428";

export function productionTarget(config) {
  const databases = Object.entries(config.worker.env).filter(
    ([binding, value]) =>
      binding === "DB" || (value.type === "d1" && value.id === productionDatabaseId),
  );
  const [binding, database] = databases[0] ?? [];
  if (
    config.worker.name !== "pms-api" ||
    databases.length !== 1 ||
    binding !== "DB" ||
    database.type !== "d1" ||
    database.id !== productionDatabaseId
  ) {
    throw new Error("Unexpected production configuration; review the target before proceeding");
  }
  return database;
}

export function validateMigrationManifest(journal, files) {
  if (!Array.isArray(journal?.entries)) throw new Error("Invalid migration journal");
  const names = journal.entries.map((entry, index) => {
    if (entry?.idx !== index || !/^\d{4}_[a-zA-Z0-9_]+$/.test(entry.tag)) {
      throw new Error("Invalid migration journal; review it before proceeding");
    }
    return `${entry.tag}.sql`;
  });
  if (
    !names.length ||
    names.length !== files.length ||
    names.some((name) => !files.some((file) => file.name === name))
  ) {
    throw new Error("Migration SQL and journal entries disagree");
  }
  return names.map((name, index) => {
    const file = files.find((file) => file.name === name);
    if (!file.regular || (index && name <= names[index - 1])) {
      throw new Error("Migration files must be regular files in ascending journal order");
    }
    if (!file.sql.trim()) throw new Error(`Empty migration: ${name}`);
    return { name, sql: file.sql };
  });
}

export function readMigrationManifest(migrationsDir) {
  const journal = JSON.parse(readFileSync(join(migrationsDir, "meta/_journal.json"), "utf8"));
  const files = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .map((name) => {
      const path = join(migrationsDir, name);
      const regular = lstatSync(path).isFile();
      return { name, regular, sql: regular ? readFileSync(path, "utf8") : "" };
    });
  const ordered = validateMigrationManifest(journal, files);
  return { files: ordered, names: ordered.map((file) => file.name) };
}
