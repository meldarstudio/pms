#!/usr/bin/env node
// Isolated PMS portal + API for verification. Kills only processes this script started.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createConnection } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const skillDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(skillDir, "../../..");
const runDir = resolve(skillDir, ".run");
const statePath = resolve(runDir, "state.json");
const persistTo = resolve(runDir, "d1");
const evidenceDir = resolve(skillDir, "artifacts");
const apiPort = 8799;
const portalPort = 5179;
const inspectorPort = 9239;
const anchor = "2026-10-13";
const apiUrl = `http://127.0.0.1:${apiPort}`;
const portalUrl = `http://127.0.0.1:${portalPort}`;

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function readState() {
  try {
    return JSON.parse(readFileSync(statePath, "utf8"));
  } catch {
    return null;
  }
}

function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function portOpen(port) {
  return new Promise((resolvePromise) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    const done = (open) => {
      socket.removeAllListeners();
      socket.destroy();
      resolvePromise(open);
    };
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

function killGroup(pid) {
  if (!alive(pid)) return;
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // already gone
    }
  }
}

async function waitDead(pid) {
  const deadline = Date.now() + 4000;
  while (alive(pid) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 200));
  }
  if (!alive(pid)) return;
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // already gone
    }
  }
}

async function waitFor(url, accept) {
  const deadline = Date.now() + 90000;
  let last = "no response";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      const body = await response.text();
      if (response.ok && accept(body)) return body;
      last = `${response.status} ${body.slice(0, 180)}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`${url} was not ready: ${last}`);
}

function spawnLogged(command, args, cwd, logName, extraEnv) {
  const log = openSync(resolve(runDir, logName), "w");
  const child = spawn(command, args, {
    cwd,
    detached: true,
    stdio: ["ignore", log, log],
    env: { ...process.env, ...extraEnv },
  });
  child.unref();
  return child.pid;
}

async function launch() {
  const existing = readState();
  if (existing && (alive(existing.apiPid) || alive(existing.portalPid))) {
    fail(
      `A verification instance is already running. Run cleanup before launch.\n${JSON.stringify(existing)}`,
    );
    return;
  }
  if ((await portOpen(apiPort)) || (await portOpen(portalPort))) {
    fail(
      `Port ${apiPort} or ${portalPort} is already in use. Verification will not take over an existing server.`,
    );
    return;
  }
  mkdirSync(evidenceDir, { recursive: true });
  mkdirSync(runDir, { recursive: true });
  rmSync(persistTo, { recursive: true, force: true });
  mkdirSync(persistTo, { recursive: true });
  const reset = spawnSync(
    "pnpm",
    ["db:reset:local", `--date=${anchor}`, `--persist-to=${persistTo}`],
    { cwd: repoRoot, stdio: "inherit" },
  );
  if (reset.status !== 0) {
    fail("Database reset failed. No servers were started.");
    return;
  }
  const apiPid = spawnLogged(
    "pnpm",
    [
      "exec",
      "wrangler",
      "dev",
      "--port",
      String(apiPort),
      "--ip",
      "127.0.0.1",
      "--inspector-port",
      String(inspectorPort),
      "--persist-to",
      persistTo,
    ],
    resolve(repoRoot, "apps/backend"),
    "api.log",
  );
  const portalPid = spawnLogged(
    "pnpm",
    ["exec", "vite", "--host", "127.0.0.1", "--port", String(portalPort), "--strictPort"],
    resolve(repoRoot, "apps/portal"),
    "portal.log",
    { VITE_API_BASE_URL: apiUrl },
  );
  const state = {
    apiUrl,
    portalUrl,
    apiPort,
    portalPort,
    inspectorPort,
    persistTo,
    anchor,
    evidenceDir,
    apiPid,
    portalPid,
  };
  writeFileSync(statePath, JSON.stringify(state, null, 2));
  try {
    await waitFor(`${apiUrl}/`, (body) => JSON.parse(body).name === "pms");
    await waitFor(`${apiUrl}/room-types`, (body) => {
      const rows = JSON.parse(body);
      const names = new Set(rows.map((row) => row.name));
      return (
        rows.length === 3 &&
        names.has("Estándar") &&
        names.has("Superior") &&
        names.has("Suite familiar")
      );
    });
    await waitFor(`${apiUrl}/rooms`, (body) => JSON.parse(body).length === 60);
    await waitFor(
      `${portalUrl}/`,
      (body) => body.includes("Gestión hotelera") && body.includes('id="root"'),
    );
    await waitFor(`${portalUrl}/src/lib/api.ts`, (body) => body.includes(apiUrl));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    console.error("Launch failed. Stopping the processes this run started.");
    killGroup(apiPid);
    killGroup(portalPid);
    await waitDead(apiPid);
    await waitDead(portalPid);
    rmSync(statePath, { force: true });
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify(state));
}

async function doctor() {
  const state = readState();
  if (!state) {
    fail("No verification instance. Run launch first.");
    return;
  }
  const report = {
    apiUrl: state.apiUrl,
    portalUrl: state.portalUrl,
    persistTo: state.persistTo,
    anchor: state.anchor,
    evidenceDir: state.evidenceDir,
    apiPidAlive: alive(state.apiPid),
    portalPidAlive: alive(state.portalPid),
    apiIdentity: false,
    roomTypes: 0,
    rooms: 0,
    portalReady: false,
    portalTargetsApi: false,
  };
  try {
    const identity = await fetch(`${state.apiUrl}/`);
    report.apiIdentity = identity.ok && (await identity.json()).name === "pms";
    const types = await fetch(`${state.apiUrl}/room-types`);
    const typeRows = types.ok ? await types.json() : [];
    report.roomTypes = Array.isArray(typeRows) ? typeRows.length : 0;
    const rooms = await fetch(`${state.apiUrl}/rooms`);
    const roomRows = rooms.ok ? await rooms.json() : [];
    report.rooms = Array.isArray(roomRows) ? roomRows.length : 0;
    const portal = await fetch(`${state.portalUrl}/`);
    const html = portal.ok ? await portal.text() : "";
    report.portalReady = html.includes("Gestión hotelera") && html.includes('id="root"');
    const apiModule = await fetch(`${state.portalUrl}/src/lib/api.ts`);
    const source = apiModule.ok ? await apiModule.text() : "";
    report.portalTargetsApi = source.includes(state.apiUrl);
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
  }
  const ok =
    report.apiPidAlive &&
    report.portalPidAlive &&
    report.apiIdentity &&
    report.roomTypes === 3 &&
    report.rooms === 60 &&
    report.portalReady &&
    report.portalTargetsApi &&
    state.persistTo === persistTo &&
    state.anchor === anchor;
  console.log(JSON.stringify({ ok, ...report }));
  if (!ok) process.exitCode = 1;
}

async function cleanup() {
  const state = readState();
  if (!state) {
    console.log(JSON.stringify({ cleaned: false, reason: "no state" }));
    return;
  }
  killGroup(state.apiPid);
  killGroup(state.portalPid);
  await waitDead(state.apiPid);
  await waitDead(state.portalPid);
  rmSync(runDir, { recursive: true, force: true });
  console.log(
    JSON.stringify({
      cleaned: true,
      evidenceDir,
      stoppedPids: [state.apiPid, state.portalPid],
    }),
  );
}

const command = process.argv[2];
if (command === "launch") await launch();
else if (command === "doctor") await doctor();
else if (command === "cleanup") await cleanup();
else fail("Usage: verify-pms.mjs launch | doctor | cleanup");
