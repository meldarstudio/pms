import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { hashPassword } from "better-auth/crypto";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import app from "./index";
import { accountSql } from "./account-sql";
import { PORTAL_ORIGIN, login, loginBody } from "./test-support/auth";
import { createTestDb, type TestDb } from "./test-support/d1";

let db: TestDb;

beforeEach(async () => {
  db = await createTestDb();
});

afterEach(() => db.close());

const session = (cookie: string) =>
  app.request("/session", { headers: { origin: PORTAL_ORIGIN, cookie } }, db.env);

async function runAccountScript(password: string) {
  const directory = mkdtempSync(join(tmpdir(), "pms-account-test-"));
  const sqlPath = join(directory, "account.sql");
  // Run the real prompts and hashing; intercept only Wrangler, never a local or remote DB.
  writeFileSync(
    join(directory, "pnpm"),
    `#!/usr/bin/env node
const { copyFileSync } = require('node:fs');
copyFileSync(process.argv[process.argv.indexOf('--file') + 1], process.env.ACCOUNT_SQL_PATH);
`,
    { mode: 0o755 },
  );
  try {
    return await new Promise<{ status: number | null; output: string; sql: string | null }>(
      (resolve, reject) => {
        const script = fileURLToPath(new URL("../scripts/account.mjs", import.meta.url));
        const child = spawn(
          process.execPath,
          [script, "hotelmanantial", "--role=staff", "--local"],
          {
            env: {
              ...process.env,
              PATH: `${directory}:${process.env.PATH}`,
              ACCOUNT_SQL_PATH: sqlPath,
            },
            stdio: ["pipe", "pipe", "pipe"],
          },
        );
        let output = "";
        let answers = 0;
        const timer = setTimeout(() => {
          child.kill("SIGKILL");
          reject(new Error(`Account script timed out: ${output}`));
        }, 5000);
        const collect = (chunk: Buffer) => {
          output += chunk.toString();
          if (answers === 0 && output.includes("Password for hotelmanantial:")) {
            answers++;
            child.stdin.write(`${password}\n`);
          } else if (answers === 1 && output.includes("Repeat password:")) {
            answers++;
            child.stdin.write(`${password}\n`);
          }
        };
        child.stdout.on("data", collect);
        child.stderr.on("data", collect);
        child.on("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
        child.on("close", (status) => {
          clearTimeout(timer);
          resolve({
            status,
            output,
            sql: existsSync(sqlPath) ? readFileSync(sqlPath, "utf8") : null,
          });
        });
      },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("account script SQL", () => {
  it("creates an account that can sign in with its role", async () => {
    db.sqlite.exec(
      accountSql({
        username: "Recepcion",
        role: "staff",
        passwordHash: await hashPassword("reception password 1"),
        id: "reception",
        now: Date.now(),
      }),
    );
    const response = await login(db.env, {
      username: "recepcion",
      password: "reception password 1",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ username: "recepcion", role: "staff" });
  });

  it("resets an existing account's password and signs out its sessions", async () => {
    const before = (await login(db.env)).headers.getSetCookie()[0]!.split(";")[0]!;
    db.sqlite.exec(
      accountSql({
        username: "hotelmanantial",
        role: "staff",
        passwordHash: await hashPassword("the reset staff password"),
        id: "reset",
        now: Date.now(),
      }),
    );
    expect((await session(before)).status).toBe(401);
    expect((await login(db.env)).status).toBe(401);
    expect((await login(db.env, loginBody({ password: "the reset staff password" }))).status).toBe(
      200,
    );
  });

  it("rejects a username Better Auth could not sign in with", () => {
    expect(() =>
      accountSql({ username: "no spaces", role: "staff", passwordHash: "x", id: "x", now: 0 }),
    ).toThrow("Usernames use 3 to 30 letters, digits, underscores, or dots.");
  });
});

describe("account script password limits", () => {
  it("accepts a 128-character reset that can sign in", async () => {
    const before = (await login(db.env)).headers.getSetCookie()[0]!.split(";")[0]!;
    const password = "a".repeat(128);
    const result = await runAccountScript(password);
    expect(result.status, result.output).toBe(0);
    expect(result.sql).not.toBeNull();
    db.sqlite.exec(result.sql!);
    expect((await session(before)).status).toBe(401);
    expect((await login(db.env, loginBody({ password }))).status).toBe(200);
  });

  it.each([
    [11, "Use at least 12 characters."],
    [129, "Use at most 128 characters."],
  ])(
    "rejects a %i-character reset before changing credentials or sessions",
    async (length, message) => {
      const before = (await login(db.env)).headers.getSetCookie()[0]!.split(";")[0]!;
      const result = await runAccountScript("a".repeat(length));
      expect(result.status, result.output).toBe(1);
      expect(result.output).toContain(message);
      expect(result.sql).toBeNull();
      expect((await session(before)).status).toBe(200);
      expect((await login(db.env)).status).toBe(200);
    },
  );
});
