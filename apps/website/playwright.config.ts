import { defineConfig } from "@playwright/test";
import { LOCAL_API_URL, WEBSITE_URL } from "./tests/support/local-api";

const { port, hostname } = new URL(WEBSITE_URL);

export default defineConfig({
  use: {
    baseURL: WEBSITE_URL,
    browserName: "chromium",
  },
  webServer: [
    {
      command: "node scripts/local-api.mjs",
      url: `${LOCAL_API_URL}/`,
      reuseExistingServer: false,
      timeout: 120_000,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    },
    {
      // Keeps the server in the foreground. Astro otherwise backgrounds it in
      // agent sessions, and Playwright treats that as the server exiting.
      command: `pnpm preview --ignore-lock --host ${hostname} --port ${port}`,
      url: `${WEBSITE_URL}/`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: "smoke",
      testDir: "./tests/smoke",
    },
  ],
});
