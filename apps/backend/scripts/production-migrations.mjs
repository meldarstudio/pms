import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function productionTarget(config) {
  const databases = config.d1_databases.filter(
    (database) => database.database_name === "pms-production" || database.binding === "DB",
  );
  const database = databases[0];
  if (
    config.name !== "pms-api" ||
    databases.length !== 1 ||
    database.database_name !== "pms-production" ||
    database.binding !== "DB" ||
    !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(database.database_id ?? "") ||
    (database.migrations_table && database.migrations_table !== "d1_migrations") ||
    database.migrations_pattern
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
