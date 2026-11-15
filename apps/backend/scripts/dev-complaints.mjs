import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { parseEnv } from "node:util";
import fixture from "../src/test-support/complaint-book.development.json" with { type: "json" };
import {
  fakeTurnstile,
  TURNSTILE_TEST_SECRET,
  TURNSTILE_ORIGIN,
} from "../src/test-support/turnstile.ts";
import { fakeResend, RESEND_TEST_KEY } from "../src/test-support/resend.ts";
import { applyMigrations, localDatabase } from "./d1.mjs";

function devVars() {
  try {
    return parseEnv(readFileSync(new URL("../.dev.vars", import.meta.url), "utf8"));
  } catch {
    return {};
  }
}

const vars = { ...devVars(), ...process.env };
const realKey = vars.COMPLAINT_RECEIPT_RESEND_API_KEY ?? "";
const realSender = vars.COMPLAINT_RECEIPT_EMAIL_FROM ?? "";
if (Boolean(realKey) !== Boolean(realSender)) {
  console.error(
    "Set both COMPLAINT_RECEIPT_RESEND_API_KEY and COMPLAINT_RECEIPT_EMAIL_FROM to send real receipts, or neither to simulate them.",
  );
  process.exit(1);
}
const sendsRealReceipts = Boolean(realKey);
const config = sendsRealReceipts
  ? { ...fixture, emailFrom: realSender, receiptDelivery: "resend" }
  : fixture;
console.log(
  sendsRealReceipts
    ? `Receipt emails are REAL: sent through Resend from ${realSender} to the address entered on each sheet.`
    : "Receipt emails are simulated on http://127.0.0.1:8790.",
);

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
    `COMPLAINT_BOOK:${JSON.stringify(config)}`,
    "--var",
    `RESEND_API_KEY:${sendsRealReceipts ? realKey : RESEND_TEST_KEY}`,
    "--var",
    "RESEND_API_URL:http://127.0.0.1:8790",
    "--var",
    `TURNSTILE_SECRET_KEY:${TURNSTILE_TEST_SECRET}`,
    "--var",
    "TURNSTILE_VERIFY_URL:http://127.0.0.1:8790/turnstile/v0/siteverify",
  ],
  {
    stdio: "inherit",
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
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
