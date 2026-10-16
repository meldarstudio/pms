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
    overrides: [
      {
        files: ["apps/portal/**/*.{ts,tsx}"],
        options: {
          sortTailwindcss: {
            stylesheet: "./apps/portal/src/index.css",
            functions: ["cn", "cva"],
          },
        },
      },
    ],
  },
  lint: {
    plugins: ["typescript", "unicorn", "oxc", "react"],
    categories: {
      correctness: "error",
    },
    env: {
      browser: true,
    },
    jsPlugins: [
      {
        name: "vite-plus",
        specifier: "vite-plus/oxlint-plugin",
      },
    ],
    rules: {
      "vite-plus/prefer-vite-plus-imports": "error",
      "react/rules-of-hooks": "error",
      "react/exhaustive-deps": "warn",
    },
    options: {
      typeAware: true,
      // pnpm check runs the package compilers with their existing tsconfig scope.
      // Native typeCheck also checks portal tests excluded by tsconfig.app.json.
      typeCheck: false,
    },
    ignorePatterns: [
      "**/*",
      "!apps/",
      "!apps/portal/",
      "!apps/portal/**/",
      "!apps/portal/**/*.{ts,tsx}",
      "apps/portal/dist/**",
    ],
  },
  test: {
    projects: ["./apps/backend", "./apps/portal"],
  },
});
