import { resolve } from "node:path";
import { defineConfig } from "vite-plus";
import { noComments } from "../../tooling/lint.ts";

export default defineConfig({
  lint: {
    ...noComments,
    categories: { correctness: "off" },
    ignorePatterns: ["dist/**", ".astro/**", ".local-api/**", "public/**", "**/.pnpm-store/**"],
  },
  test: {
    name: "website",
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
});
