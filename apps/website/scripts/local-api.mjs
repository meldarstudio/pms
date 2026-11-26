import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer, request } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import cfPackage from "cf/package.json" with { type: "json" };
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
  unavailableStay,
} from "../tests/support/local-api.ts";

const backend = fileURLToPath(new URL("../../backend/", import.meta.url));
const workspace = fileURLToPath(new URL("../.local-api/", import.meta.url));
rmSync(workspace, { recursive: true, force: true });
mkdirSync(workspace, { recursive: true });
const state = join(workspace, "state");
const vars = join(workspace, ".dev.vars");

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
    closeRooms("double-sold-out", doubleSoldOutStay(), ["a50f22a2-c02c-4cb1-ab98-e9da48f0228d"]),
    closeRooms("all-sold-out", allSoldOutStay(), PUBLISHED_ROOM_TYPE_IDS),
    `INSERT INTO operation_controls (id, public_payments_admitted, updated_at, updated_by)
      VALUES (1, 1, '2026-01-01T00:00:00.000Z', 'website-tests');`,
  ].join("\n"),
);

writeFileSync(
  vars,
  [
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
const backendPort = Number(port) + 2;
const unavailable = unavailableStay();
const publicApi = createServer((req, res) => {
  const url = new URL(req.url, LOCAL_API_URL);
  if (
    req.method === "GET" &&
    url.pathname === "/public/offers" &&
    url.searchParams.get("checkIn") === unavailable.checkIn &&
    url.searchParams.get("checkOut") === unavailable.checkOut
  ) {
    res.writeHead(503, { "access-control-allow-origin": WEBSITE_URL }).end();
    return;
  }
  const backendRequest = request(
    { hostname, port: backendPort, path: req.url, method: req.method, headers: req.headers },
    (response) => {
      res.writeHead(response.statusCode, response.headers);
      response.pipe(res);
    },
  );
  backendRequest.on("error", () => res.writeHead(503).end());
  req.pipe(backendRequest);
});
publicApi.listen(Number(port), hostname);
const cfBin = fileURLToPath(new URL(cfPackage.bin.cf, import.meta.resolve("cf/package.json")));
const server = spawn(
  process.execPath,
  [cfBin, "dev", "--", "--host", hostname, "--port", String(backendPort)],
  {
    cwd: backend,
    detached: process.platform !== "win32",
    stdio: "inherit",
    env: { ...process.env, PMS_LOCAL_API_DIR: workspace },
  },
);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.kill(signal));
server.on("exit", (code) => {
  publicApi.close();
  paymentServices.close();
  process.exit(code ?? 0);
});
