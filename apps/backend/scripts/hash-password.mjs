import { createInterface } from "node:readline";
import { randomBytes } from "node:crypto";
import { Writable } from "node:stream";
import { hashPassword } from "../src/password.ts";

const MIN_LENGTH = 12;

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
  const ask = (question) =>
    Promise.race([
      new Promise((resolve) => {
        rl.question(question, (answer) => {
          process.stderr.write("\n");
          resolve(answer);
        });
        muted = true;
      }),
      closed,
    ]);
  return { ask, close: () => rl.close() };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log("Usage: pnpm auth:hash [--session-secret]");
    console.log("Prompts for the staff password and prints its ADMIN_PASSWORD_HASH.");
    console.log("--session-secret prints a new random SESSION_SECRET instead.");
    return;
  }
  if (args.includes("--session-secret")) {
    console.log(randomBytes(32).toString("base64url"));
    return;
  }
  if (args.length) throw new Error(`Unknown option: ${args[0]}`);

  const prompt = createPrompt();
  try {
    const password = await prompt.ask("Staff password: ");
    if (password.length < MIN_LENGTH) {
      throw new Error(`Use at least ${MIN_LENGTH} characters.`);
    }
    if ((await prompt.ask("Repeat password: ")) !== password) {
      throw new Error("Passwords do not match.");
    }
    console.log(await hashPassword(password));
  } finally {
    prompt.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
