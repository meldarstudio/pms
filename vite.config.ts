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
    plugins: ["typescript", "unicorn", "oxc"],
    categories: {
      correctness: "error",
    },
    jsPlugins: [
      {
        name: "vite-plus",
        specifier: "vite-plus/oxlint-plugin",
      },
    ],
    rules: {
      "no-undef": "error",
      "vite-plus/prefer-vite-plus-imports": "error",
    },
    overrides: [
      {
        files: ["apps/portal/**/*.{ts,tsx}"],
        plugins: ["typescript", "unicorn", "oxc", "react"],
        // Category defaults only expand at the top level, so retain the portal's
        // existing React correctness rules explicitly in this override.
        rules: {
          "react/error-boundaries": "error",
          "react/exhaustive-deps": "warn",
          "react/forward-ref-uses-ref": "error",
          "react/globals": "error",
          "react/immutability": "error",
          "react/incompatible-library": "error",
          "react/jsx-key": "error",
          "react/jsx-no-duplicate-props": "error",
          "react/jsx-no-undef": "error",
          "react/jsx-props-no-spread-multi": "error",
          "react/no-children-prop": "error",
          "react/no-danger-with-children": "error",
          "react/no-did-mount-set-state": "error",
          "react/no-did-update-set-state": "error",
          "react/no-direct-mutation-state": "error",
          "react/no-find-dom-node": "error",
          "react/no-is-mounted": "error",
          "react/no-render-return-value": "error",
          "react/no-string-refs": "error",
          "react/no-this-in-sfc": "error",
          "react/no-unsafe": "error",
          "react/no-will-update-set-state": "error",
          "react/preserve-manual-memoization": "error",
          "react/purity": "error",
          "react/refs": "error",
          "react/set-state-in-effect": "error",
          "react/set-state-in-render": "error",
          "react/static-components": "error",
          "react/use-memo": "error",
          "react/void-dom-elements-no-children": "error",
          "react/void-use-memo": "error",
          "react/rules-of-hooks": "error",
        },
      },
      {
        files: ["apps/portal/src/**/*.{ts,tsx}", "apps/portal/tests/**/*.{ts,tsx}"],
        env: { browser: true },
      },
      {
        files: ["apps/backend/src/**/*.{ts,tsx}"],
        env: { serviceworker: true },
      },
      {
        files: [
          "apps/*/*.config.ts",
          "apps/backend/*.mjs",
          "apps/backend/src/**/*.test.{ts,mjs}",
          "apps/portal/tests/**/*.{ts,tsx}",
        ],
        env: { node: true },
      },
    ],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    ignorePatterns: [
      "**/*",
      "!apps/",
      "!apps/portal/",
      "!apps/portal/**/",
      "!apps/portal/**/*.{ts,tsx}",
      "!apps/backend/",
      "!apps/backend/**/",
      "!apps/backend/**/*.{ts,tsx,js,mjs,cjs}",
      "!packages/",
      "!packages/shared/",
      "!packages/shared/**/",
      "!packages/shared/**/*.{ts,tsx,js,mjs,cjs}",
      "apps/backend/worker-configuration.d.ts",
      "apps/backend/drizzle/**",
      "**/dist/**",
      "**/coverage/**",
      "**/.wrangler/**",
      "**/.pnpm-store/**",
    ],
  },
  test: {
    projects: ["./apps/backend", "./apps/portal"],
  },
});
