import { defineConfig } from "@playwright/test";

export default defineConfig({
  use: {
    baseURL: "http://127.0.0.1:43987",
    browserName: "chromium",
  },
  webServer: {
    // Keeps the server in the foreground. Astro otherwise backgrounds it in
    // agent sessions, and Playwright treats that as the server exiting.
    command: "pnpm preview --ignore-lock --host 127.0.0.1 --port 43987",
    url: "http://127.0.0.1:43987/",
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: "smoke",
      testDir: "./tests/smoke",
    },
    {
      name: "a11y",
      testDir: "./tests/a11y",
    },
  ],
});
