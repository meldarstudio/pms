import { spawnSync } from "node:child_process";
import {
  CULQI_TEST_PUBLIC_KEY,
  LOCAL_API_URL,
  TURNSTILE_TEST_SITE_KEY,
} from "../tests/support/local-api.ts";

const build = spawnSync("pnpm", ["verify:build"], {
  stdio: "inherit",
  env: {
    ...process.env,
    PUBLIC_PMS_API_URL: LOCAL_API_URL,
    PUBLIC_CULQI_PUBLIC_KEY: CULQI_TEST_PUBLIC_KEY,
    PUBLIC_TURNSTILE_SITE_KEY: TURNSTILE_TEST_SITE_KEY,
  },
});
process.exit(build.status ?? 1);
