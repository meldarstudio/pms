import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { parseArgs } from "node:util";

let deadline;
try {
  const { values } = parseArgs({
    options: {
      api: { type: "string" },
      portal: { type: "string" },
      dist: { type: "string" },
      "retry-delay-ms": { type: "string", default: "2000" },
      "timeout-ms": { type: "string", default: "60000" },
    },
  });
  if (!values.api || !values.portal || !values.dist) {
    throw new Error("--api, --portal, and --dist are required");
  }
  const timeout = Number(values["timeout-ms"]);
  const retryDelay = Number(values["retry-delay-ms"]);
  if (
    !Number.isSafeInteger(timeout) ||
    timeout < 1 ||
    timeout > 120000 ||
    !Number.isSafeInteger(retryDelay) ||
    retryDelay < 0 ||
    retryDelay > 10000
  ) {
    throw new Error("Invalid smoke timeout or retry delay");
  }
  deadline = AbortSignal.timeout(timeout);
  const dist = resolve(values.dist);
  const files = [];
  async function collect(directory) {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await collect(path);
      else if (entry.isFile() && !["_headers", "_redirects"].includes(entry.name)) files.push(path);
    }
  }
  await collect(dist);
  if (!files.includes(join(dist, "index.html"))) throw new Error("Portal build has no index.html");

  async function get(url) {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      credentials: "omit",
      headers: { "Cache-Control": "no-cache" },
      signal: AbortSignal.any([deadline, AbortSignal.timeout(5000)]),
    });
    return response;
  }
  async function verify() {
    const root = await get(new URL("./", values.api));
    const rootBody = await root.text();
    if (
      root.status !== 200 ||
      !root.headers.get("Content-Type")?.includes("application/json") ||
      JSON.parse(rootBody).name !== "pms"
    )
      throw new Error("API liveness failed");
    const session = await get(new URL("session", values.api));
    const sessionBody = await session.text();
    if (
      session.status !== 401 ||
      !session.headers.get("Content-Type")?.includes("application/json") ||
      JSON.parse(sessionBody).error !== "unauthorized"
    )
      throw new Error("Unauthenticated session was not rejected");
    for (const path of files) {
      const name = relative(dist, path).split("/").map(encodeURIComponent).join("/");
      const url = new URL(name === "index.html" ? "/" : `/${name}`, values.portal);
      const response = await get(url);
      const body = Buffer.from(await response.arrayBuffer());
      const types = {
        ".html": ["text/html"],
        ".js": ["text/javascript", "application/javascript"],
        ".css": ["text/css"],
        ".webmanifest": ["application/manifest+json", "application/json"],
      }[extname(path)];
      const type = response.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase();
      if (
        response.status !== 200 ||
        (types && !types.includes(type)) ||
        !body.equals(await readFile(path))
      ) {
        throw new Error(`Portal content does not match this build: ${name}`);
      }
    }
  }
  for (let attempt = 1; ; attempt++) {
    try {
      await verify();
      break;
    } catch (error) {
      if (attempt === 3 || deadline.aborted) throw error;
      console.warn(`Smoke attempt ${attempt} failed: ${error.message}; retrying.`);
      await delay(retryDelay, undefined, { signal: deadline });
    }
  }
  console.log("Smoke checks passed. Manual login/calendar/PWA verification still required.");
} catch (error) {
  console.error(
    `Smoke checks failed: ${deadline?.aborted ? "deadline exceeded" : error.message}. Stop and investigate; no rollback or restoration performed.`,
  );
  process.exitCode = 1;
}
