import { defineConfig } from "vite-plus";
import { lint } from "../../tooling/lint";

export default defineConfig({
  lint: {
    ...lint,
    overrides: [
      { files: ["src/**/*.{ts,tsx}"], env: { serviceworker: true } },
      {
        files: ["*.config.ts", "scripts/**/*.mjs", "src/**/*.test.{ts,mjs}"],
        env: { node: true },
      },
    ],
    ignorePatterns: [
      "worker-configuration.d.ts",
      "drizzle/**",
      "dist/**",
      "coverage/**",
      ".wrangler/**",
      "**/.pnpm-store/**",
    ],
  },
  test: {
    name: "backend",
    environment: "node",
    include: ["src/**/*.test.{ts,mjs}"],
  },
});
