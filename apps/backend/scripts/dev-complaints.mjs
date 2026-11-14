import { spawn } from "node:child_process";
import { createServer } from "node:http";
import config from "../src/test-support/complaint-book.development.json" with { type: "json" };
import {
  fakeTurnstile,
  TURNSTILE_TEST_SECRET,
  TURNSTILE_ORIGIN,
} from "../src/test-support/turnstile.ts";
import { fakeResend, RESEND_TEST_KEY } from "../src/test-support/resend.ts";
import { applyMigrations, localDatabase } from "./d1.mjs";

applyMigrations(localDatabase());
const mail = fakeResend();
const security = fakeTurnstile();
const server = createServer(async (request, response) => {
  const isSecurity = request.url === "/turnstile/v0/siteverify";
  if (request.method !== "POST" || (!isSecurity && request.url !== "/emails")) {
    response.writeHead(404).end();
    return;
  }
  const parts = [];
  for await (const part of request) parts.push(part);
  const result = await (isSecurity ? security : mail).fetch(
    isSecurity ? `${TURNSTILE_ORIGIN}/turnstile/v0/siteverify` : "http://127.0.0.1:8790/emails",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${RESEND_TEST_KEY}`,
        "idempotency-key": request.headers["idempotency-key"] ?? "",
      },
      body: Buffer.concat(parts).toString(),
    },
  );
  response
    .writeHead(result.status, { "content-type": "application/json" })
    .end(await result.text());
});
server.listen(8790, "127.0.0.1");
const worker = spawn(
  "pnpm",
  [
    "exec",
    "wrangler",
    "dev",
    "--experimental-new-config",
    "--local-upstream",
    "localhost",
    "--ip",
    "localhost",
    "--port",
    "8788",
    "--var",
    `COMPLAINT_BOOK_DEVELOPMENT:${JSON.stringify(config)}`,
    "--var",
    `RESEND_API_KEY:${RESEND_TEST_KEY}`,
    "--var",
    "RESEND_API_URL:http://127.0.0.1:8790",
    "--var",
    `TURNSTILE_SECRET_KEY:${TURNSTILE_TEST_SECRET}`,
    "--var",
    "TURNSTILE_VERIFY_URL:http://127.0.0.1:8790/turnstile/v0/siteverify",
  ],
  {
    stdio: "inherit",
    env: { ...process.env, WRANGLER_SEND_METRICS: "false", PMS_COMPLAINT_FILES_LOCAL: "1" },
  },
);
const scheduled = setInterval(() => {
  void fetch("http://localhost:8788/cdn-cgi/local/scheduled", {
    signal: AbortSignal.timeout(3000),
  }).catch(() => {});
}, 5000);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => worker.kill(signal));
worker.on("exit", (code) => {
  clearInterval(scheduled);
  server.close();
  process.exit(code ?? 0);
});
