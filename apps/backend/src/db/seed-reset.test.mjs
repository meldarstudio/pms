import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

const backendDir = new URL("../../", import.meta.url);
const migrationsDir = new URL("drizzle/", backendDir);
const journal = JSON.parse(readFileSync(new URL("meta/_journal.json", migrationsDir), "utf8"));
let db;

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const entry of journal.entries) {
    db.exec(readFileSync(new URL(`${entry.tag}.sql`, migrationsDir), "utf8"));
  }
});

afterEach(() => {
  db.close();
});

describe("local dummy data reset", () => {
  it.each([["--remote"]])("refuses remote reset before running cf: %j", (...args) => {
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL("scripts/seed-reset.mjs", backendDir)), ...args],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unknown option: --remote");
    expect(result.stdout).toBe("");
  });

  it.each([
    ["db:reset:local", "scripts/seed-reset.mjs", ["--rebuild-schema"]],
    ["db:migrate:local", "scripts/migrate-local.mjs", []],
  ])("%s never reaches the production database", (_, script, args) => {
    const directory = mkdtempSync(join(tmpdir(), "pms-local-d1-test-"));
    try {
      const log = join(directory, "commands.jsonl");
      writeFileSync(log, "");
      writeFileSync(
        join(directory, "pnpm"),
        `#!/usr/bin/env node
const { appendFileSync } = require('node:fs');
appendFileSync(process.env.COMMAND_LOG, JSON.stringify(process.argv.slice(2)) + '\\n');
process.stdout.write(JSON.stringify([{ success: true, results: { columns: ['type', 'name', 'tbl_name'], rows: [] } }]));
`,
        { mode: 0o755 },
      );
      const result = spawnSync(
        process.execPath,
        [fileURLToPath(new URL(script, backendDir)), ...args],
        {
          encoding: "utf8",
          env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, COMMAND_LOG: log },
        },
      );
      expect(result.status, result.stderr).toBe(0);
      const commands = readFileSync(log, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      expect(commands.length).toBeGreaterThan(0);
      for (const command of commands) {
        expect(command.slice(0, 3)).toEqual(["exec", "cf", "d1"]);
        expect(command).toContain("--local");
        expect(command[command.indexOf("--persist-to") + 1]).toContain(".wrangler/state");
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
