import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import { hashPassword } from "better-auth/crypto";
import {
  accountSql,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  USERNAME_PATTERN,
} from "../src/account-sql.ts";

const backendDir = fileURLToPath(new URL("..", import.meta.url));
const USAGE =
  "Usage: pnpm auth:account <username> --role=staff|owner (--local [--persist-to=PATH] | --remote)";

function createPrompt() {
  let muted = false;
  const output = new Writable({
    write(chunk, _encoding, done) {
      if (!muted) process.stderr.write(chunk);
      done();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  const closed = new Promise((_, reject) =>
    rl.once("close", () => reject(new Error("No password entered."))),
  );
  const ask = (question, hidden = true) =>
    Promise.race([
      new Promise((resolve) => {
        muted = false;
        rl.question(question, (answer) => {
          if (hidden) process.stderr.write("\n");
          resolve(answer);
        });
        muted = hidden;
      }),
      closed,
    ]);
  return { ask, close: () => rl.close() };
}

function parse(args) {
  const options = new Map();
  const positional = [];
  for (const arg of args) {
    if (!arg.startsWith("--")) positional.push(arg);
    else {
      const [name, value = ""] = arg.split("=", 2);
      if (!["--role", "--local", "--remote", "--persist-to"].includes(name))
        throw new Error(`Unknown option: ${name}\n${USAGE}`);
      options.set(name, value);
    }
  }
  const [username] = positional;
  const role = options.get("--role");
  if (positional.length !== 1 || !["staff", "owner"].includes(role)) throw new Error(USAGE);
  if (options.has("--local") === options.has("--remote"))
    throw new Error(`Choose exactly one of --local or --remote.\n${USAGE}`);
  if (options.has("--remote") && options.has("--persist-to"))
    throw new Error("--persist-to only applies to --local.");
  if (!USERNAME_PATTERN.test(username.toLowerCase()))
    throw new Error("Usernames use 3 to 30 letters, digits, underscores, or dots.");
  return { username: username.toLowerCase(), role, options };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log(USAGE);
    console.log(
      "Creates the account, or replaces its password and role and signs it out everywhere.",
    );
    return;
  }
  const { username, role, options } = parse(args);
  const remote = options.has("--remote");
  const target = remote
    ? ["--remote"]
    : [
        "--local",
        ...(options.get("--persist-to")
          ? ["--persist-to", resolve(options.get("--persist-to"))]
          : []),
      ];

  const prompt = createPrompt();
  let password;
  try {
    if (remote) {
      const confirm = await prompt.ask(
        `This changes the PRODUCTION account "${username}". Type the username to continue: `,
        false,
      );
      if (confirm.trim().toLowerCase() !== username) throw new Error("Cancelled.");
    }
    password = await prompt.ask(`Password for ${username}: `);
    if (password.length < MIN_PASSWORD_LENGTH)
      throw new Error(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
    if (password.length > MAX_PASSWORD_LENGTH)
      throw new Error(`Use at most ${MAX_PASSWORD_LENGTH} characters.`);
    if ((await prompt.ask("Repeat password: ")) !== password)
      throw new Error("Passwords do not match.");
  } finally {
    prompt.close();
  }

  const sql = accountSql({
    username,
    role,
    passwordHash: await hashPassword(password),
    id: randomUUID(),
    now: Date.now(),
  });
  const temporaryDir = mkdtempSync(join(tmpdir(), "pms-account-"));
  try {
    const sqlPath = join(temporaryDir, "account.sql");
    writeFileSync(sqlPath, sql);
    const result = spawnSync(
      "pnpm",
      ["exec", "wrangler", "d1", "execute", "DB", ...target, "--file", sqlPath],
      { cwd: backendDir, stdio: "inherit" },
    );
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Wrangler failed with exit code ${result.status}`);
  } finally {
    rmSync(temporaryDir, { recursive: true, force: true });
  }
  console.log(`Account "${username}" (${role}) saved ${remote ? "in production" : "locally"}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
