import { spawnSync } from "node:child_process";
import { LOCAL_API_URL } from "../tests/support/local-api.ts";

const build = spawnSync("pnpm", ["verify:build"], {
  stdio: "inherit",
  env: { ...process.env, PUBLIC_PMS_API_URL: LOCAL_API_URL },
});
process.exit(build.status ?? 1);
