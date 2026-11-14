import developmentBook from "../../backend/src/test-support/complaint-book.development.json" with { type: "json" };
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { executeSql, localDatabase } from "../../backend/scripts/d1.mjs";
import { CULQI_TEST_KEY } from "../../backend/src/test-support/culqi.ts";
import { TURNSTILE_TEST_SECRET } from "../../backend/src/test-support/turnstile.ts";
import { RESEND_TEST_KEY } from "../../backend/src/test-support/resend.ts";
import { startFakePaymentServices } from "./fake-payment-services.mjs";
import {
  FAKE_PAYMENT_SERVICES_URL,
  LOCAL_API_URL,
  PUBLISHED_ROOM_TYPE_IDS,
  WEBSITE_URL,
  allSoldOutStay,
  doubleSoldOutStay,
} from "../tests/support/local-api.ts";

const backend = fileURLToPath(new URL("../../backend/", import.meta.url));
const workspace = fileURLToPath(new URL("../.local-api/", import.meta.url));
rmSync(workspace, { recursive: true, force: true });
mkdirSync(workspace, { recursive: true });
const state = join(workspace, "state");
const vars = join(workspace, "vars.env");

const reset = spawnSync(process.execPath, ["scripts/seed-reset.mjs", "--persist-to", state], {
  cwd: backend,
  stdio: ["ignore", "ignore", "inherit"],
});
if (reset.status !== 0) throw new Error("Could not seed the local test database");

const closeRooms = (label, stay, roomTypeIds) =>
  `INSERT INTO room_closures (id, room_id, starts, ends, reason, created_at)
    SELECT '${label}-' || id, id, '${stay.checkIn}', '${stay.checkOut}', 'website test', '2026-01-01T00:00:00.000Z'
    FROM rooms WHERE room_type_id IN (${roomTypeIds.map((id) => `'${id}'`).join(", ")});`;
executeSql(
  localDatabase(state),
  [
    closeRooms("double-sold-out", doubleSoldOutStay(), ["type-doble-premium"]),
    closeRooms("all-sold-out", allSoldOutStay(), PUBLISHED_ROOM_TYPE_IDS),
    `INSERT INTO operation_controls (id, public_payments_admitted, updated_at, updated_by)
      VALUES (1, 1, '2026-01-01T00:00:00.000Z', 'website-tests');`,
  ].join("\n"),
);

writeFileSync(
  vars,
  [
    `COMPLAINT_BOOK_DEVELOPMENT='${JSON.stringify(developmentBook).replaceAll("'", "\\u0027")}'`,
    `SESSION_SECRET=${randomBytes(32).toString("hex")}`,
    `PUBLIC_ALLOWED_ORIGINS=${WEBSITE_URL}`,
    `PUBLISHED_ROOM_TYPE_IDS=${PUBLISHED_ROOM_TYPE_IDS.join(",")}`,
    `CULQI_SECRET_KEY=${CULQI_TEST_KEY}`,
    `CULQI_API_URL=${FAKE_PAYMENT_SERVICES_URL}/v2`,
    `TURNSTILE_SECRET_KEY=${TURNSTILE_TEST_SECRET}`,
    `TURNSTILE_VERIFY_URL=${FAKE_PAYMENT_SERVICES_URL}/turnstile/v0/siteverify`,
    `RESEND_API_KEY=${RESEND_TEST_KEY}`,
    `RESEND_API_URL=${FAKE_PAYMENT_SERVICES_URL}`,
  ].join("\n"),
);

const paymentServices = startFakePaymentServices(FAKE_PAYMENT_SERVICES_URL);

const { hostname, port } = new URL(LOCAL_API_URL);
const server = spawn(
  "pnpm",
  [
    "exec",
    "wrangler",
    "dev",
    "--experimental-new-config",
    "--local-upstream",
    "localhost",
    "--ip",
    hostname,
    "--port",
    port,
    "--persist-to",
    state,
    "--env-file",
    vars,
    "--show-interactive-dev-session=false",
    "--log-level",
    "warn",
  ],
  {
    cwd: backend,
    stdio: "inherit",
    env: { ...process.env, WRANGLER_SEND_METRICS: "false", WRANGLER_WRITE_LOGS: "false" },
  },
);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.kill(signal));
server.on("exit", (code) => {
  paymentServices.close();
  process.exit(code ?? 0);
});
