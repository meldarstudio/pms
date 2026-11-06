import { readFileSync } from "node:fs";
import { executeSql, localDatabase } from "./d1.mjs";
import { seedLocalOwner } from "./local-owner.mjs";

try {
  executeSql(localDatabase(), readFileSync(new URL("../seed.sql", import.meta.url), "utf8"));
  await seedLocalOwner();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
