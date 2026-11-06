import { applyMigrations, localDatabase } from "./d1.mjs";

try {
  applyMigrations(localDatabase());
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
