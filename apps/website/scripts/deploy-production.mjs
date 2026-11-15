import { spawnSync } from "node:child_process";

const siteKey = process.env.PUBLIC_TURNSTILE_SITE_KEY ?? "";
if (!/^0x/.test(siteKey)) {
  console.error(
    "Set PUBLIC_TURNSTILE_SITE_KEY to the live Turnstile site key; the Libro de Reclamaciones cannot accept sheets without it.",
  );
  process.exit(1);
}
if (process.env.PUBLIC_PMS_API_URL) {
  console.error(
    "Unset PUBLIC_PMS_API_URL; the production website builds against the production API.",
  );
  process.exit(1);
}
for (const command of [
  ["verify:build"],
  ["exec", "wrangler", "deploy", ...process.argv.slice(2)],
]) {
  const step = spawnSync("pnpm", command, { stdio: "inherit" });
  if (step.status !== 0) process.exit(step.status ?? 1);
}
