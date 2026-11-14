import { spawn } from "node:child_process";
import { createServer } from "node:http";
import config from "../src/test-support/complaint-book.development.json" with { type: "json" };
import { fakeResend, RESEND_TEST_KEY } from "../src/test-support/resend.ts";
import { applyMigrations, localDatabase } from "./d1.mjs";

applyMigrations(localDatabase());
const mail = fakeResend();
const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/emails") {
    response.writeHead(404).end();
    return;
  }
  const parts = [];
  for await (const part of request) parts.push(part);
  const result = await mail.fetch("http://127.0.0.1:8790/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${RESEND_TEST_KEY}`,
      "idempotency-key": request.headers["idempotency-key"] ?? "",
    },
    body: Buffer.concat(parts).toString(),
  });
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
  ],
  { stdio: "inherit", env: { ...process.env, WRANGLER_SEND_METRICS: "false" } },
);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => worker.kill(signal));
worker.on("exit", (code) => {
  server.close();
  process.exit(code ?? 0);
});
