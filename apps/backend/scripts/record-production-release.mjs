import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const workers = [
  { key: "api", name: "pms-api", package: "@pms/backend" },
  { key: "portal", name: "pms-portal", package: "@pms/portal" },
];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const repo = fileURLToPath(new URL("../../../", import.meta.url));

function uploadedVersion(directory, worker) {
  const entries = readFileSync(join(directory, `${worker.key}.jsonl`), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))
    .filter((entry) => entry.type === "deploy");
  if (
    entries.length !== 1 ||
    entries[0].version !== 1 ||
    entries[0].worker_name !== worker.name ||
    !uuid.test(entries[0].version_id)
  ) {
    throw new Error(`Missing or invalid upload identity for ${worker.name}`);
  }
  return entries[0].version_id;
}

try {
  const { values } = parseArgs({ options: { verify: { type: "boolean", default: false } } });
  const directory = process.env.RELEASE_EVIDENCE_DIR;
  if (!directory) throw new Error("RELEASE_EVIDENCE_DIR is required");
  if (values.verify) {
    if (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_API_TOKEN)
      throw new Error("Deployment-status credentials are missing");
    let failed = false;
    for (const worker of workers) {
      try {
        const expected = uploadedVersion(directory, worker);
        const result = spawnSync(
          "pnpm",
          ["--filter", worker.package, "exec", "wrangler", "deployments", "status", "--json"],
          {
            cwd: repo,
            encoding: "utf8",
            timeout: 30000,
            maxBuffer: 1024 * 1024,
          },
        );
        if (result.error || result.status !== 0)
          throw new Error(`Could not read deployment status for ${worker.name}`);
        const deployment = JSON.parse(result.stdout);
        if (
          !uuid.test(deployment.id) ||
          !Array.isArray(deployment.versions) ||
          !deployment.versions.every(
            (version) => uuid.test(version.version_id) && Number.isFinite(version.percentage),
          )
        )
          throw new Error(`Invalid deployment status for ${worker.name}`);
        writeFileSync(
          join(directory, `${worker.key}-active.json`),
          JSON.stringify({ id: deployment.id, versions: deployment.versions }),
        );
        if (
          deployment.versions.length !== 1 ||
          deployment.versions[0].version_id !== expected ||
          deployment.versions[0].percentage !== 100
        )
          throw new Error(`Active version does not match this release for ${worker.name}`);
        console.log(`${worker.name}: deployment ${deployment.id}, version ${expected} at 100%`);
      } catch (error) {
        failed = true;
        console.error(error.message);
      }
    }
    if (failed)
      throw new Error(
        "Deployment identity verification failed; inspect both Worker histories. No rollback performed",
      );
  } else {
    console.log("### Deployment identities\n");
    for (const worker of workers) {
      let uploaded = "unknown (upload not confirmed)";
      let active = "unknown (active deployment not confirmed)";
      try {
        uploaded = uploadedVersion(directory, worker);
      } catch {}
      try {
        const record = JSON.parse(
          readFileSync(join(directory, `${worker.key}-active.json`), "utf8"),
        );
        if (
          uuid.test(record.id) &&
          Array.isArray(record.versions) &&
          record.versions.every((v) => uuid.test(v.version_id) && Number.isFinite(v.percentage))
        ) {
          active = `${record.id}; versions: ${record.versions.map((v) => `${v.version_id} (${v.percentage}%)`).join(", ")}`;
        }
      } catch {}
      console.log(
        `- **${worker.name}** — uploaded version: ${uploaded}; active deployment: ${active}`,
      );
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
