import { defineConfig } from "vite-plus";

export default defineConfig({
  defaultPackage: "./apps/portal",
  fmt: {
    ignorePatterns: [
      "pnpm-lock.yaml",
      "skills-lock.json",
      "apps/backend/worker-configuration.d.ts",
      "apps/backend/drizzle/meta/**",
      ".agents/skills/**",
      "**/coverage/**",
      "**/.pnpm-store/**",
    ],
  },
  test: {
    // UI suites each compile the portal in their own Vite server.
    fileParallelism: false,
    projects: ["./apps/backend", "./apps/portal"],
  },
});
