import { execFile } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, expect, it } from "vite-plus/test";

const run = promisify(execFile);
const script = fileURLToPath(new URL("../scripts/smoke-production.mjs", import.meta.url));
const cleanups = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function fixture(changeResponse = () => {}) {
  const dist = mkdtempSync(join(tmpdir(), "pms-smoke-test-"));
  cleanups.push(() => rmSync(dist, { recursive: true }));
  mkdirSync(join(dist, "assets"));
  const files = {
    "/": '<!doctype html><script type="module" src="/assets/app.js"></script>',
    "/assets/app.js": 'console.log("current release");',
    "/sw.js": 'const CACHE = "current release";',
    "/manifest.webmanifest": '{"name":"PMS"}',
  };
  for (const [path, content] of Object.entries(files)) {
    writeFileSync(join(dist, path === "/" ? "index.html" : path), content);
  }
  // Cloudflare configuration is build metadata, not a publicly served asset.
  writeFileSync(join(dist, "_headers"), "/*\n  X-Content-Type-Options: nosniff\n");
  const requests = [];
  const server = createServer((request, response) => {
    const path = new URL(request.url, "http://localhost").pathname;
    requests.push({ method: request.method, path, cookie: request.headers.cookie });
    if (changeResponse(path, response)) return;
    if (path === "/api/") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end('{"name":"pms"}');
    } else if (path === "/api/session") {
      response.writeHead(401, { "Content-Type": "application/json" });
      response.end('{"error":"unauthorized"}');
    } else if (Object.hasOwn(files, path)) {
      const type =
        path === "/"
          ? "text/html"
          : path.endsWith(".js")
            ? "text/javascript"
            : "application/manifest+json";
      response.writeHead(200, { "Content-Type": type });
      response.end(files[path]);
    } else {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanups.push(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    requests,
    check: (extra = []) =>
      run(
        process.execPath,
        [
          script,
          "--api",
          `${origin}/api/`,
          "--portal",
          origin,
          "--dist",
          dist,
          "--retry-delay-ms",
          "10",
          ...extra,
        ],
        { timeout: 5000 },
      ),
  };
}

it("accepts live public API responses and the exact built portal without staff credentials", async () => {
  const f = await fixture();
  const result = await f.check();
  expect(result.stdout).toContain("Smoke checks passed");
  expect(result.stdout).toContain("Manual login/calendar/PWA verification still required");
  expect(new Set(f.requests.map(({ path }) => path))).toEqual(
    new Set(["/api/", "/api/session", "/", "/assets/app.js", "/manifest.webmanifest", "/sw.js"]),
  );
  expect(f.requests.every(({ method, cookie }) => method === "GET" && !cookie)).toBe(true);
});

it("allows a transient propagation failure to recover before reporting success", async () => {
  let unavailable = true;
  const f = await fixture((path, response) => {
    if (path !== "/api/" || !unavailable) return false;
    unavailable = false;
    response.writeHead(503);
    response.end("not ready");
    return true;
  });
  expect((await f.check()).stdout).toContain("Smoke checks passed");
});

it.each([
  ["wrong API", "/api/", 200, "application/json", '{"name":"another-app"}'],
  ["unguarded session", "/api/session", 200, "application/json", '{"username":"staff"}'],
  ["redirect", "/", 302, "text/html", "redirecting"],
  ["stale asset", "/assets/app.js", 200, "text/javascript", 'console.log("old release");'],
  ["SPA fallback", "/sw.js", 200, "text/html", "<!doctype html><h1>PMS</h1>"],
  [
    "unusable script MIME type",
    "/assets/app.js",
    200,
    "text/html",
    'console.log("current release");',
  ],
])("rejects %s instead of declaring the release healthy", async (_, target, status, type, body) => {
  const f = await fixture((path, response) => {
    if (path !== target) return false;
    response.writeHead(status, { "Content-Type": type });
    response.end(body);
    return true;
  });
  await expect(f.check()).rejects.toMatchObject({
    code: 1,
    stderr: expect.stringContaining("Smoke checks failed"),
  });
});

it("stops within its deadline even when a server never finishes a response body", async () => {
  const f = await fixture((path, response) => {
    if (path !== "/api/") return false;
    response.writeHead(200, { "Content-Type": "application/json" });
    response.write('{"name":');
    return true;
  });
  await expect(f.check(["--timeout-ms", "200"])).rejects.toMatchObject({
    code: 1,
    stderr: expect.stringContaining("deadline exceeded"),
  });
});
