import { fileURLToPath } from "node:url";
import type { OxlintConfig } from "vite-plus/lint";

export const noComments = {
  jsPlugins: [
    {
      name: "pms",
      specifier: fileURLToPath(new URL("./no-comments.mjs", import.meta.url)),
    },
  ],
  rules: {
    "pms/no-comments": "error",
  },
} satisfies OxlintConfig;

export const lint = {
  plugins: ["typescript", "unicorn", "oxc"],
  categories: {
    correctness: "error",
  },
  jsPlugins: [
    {
      name: "vite-plus",
      specifier: "vite-plus/oxlint-plugin",
    },
    ...noComments.jsPlugins,
  ],
  rules: {
    "no-undef": "error",
    "vite-plus/prefer-vite-plus-imports": "error",
    ...noComments.rules,
  },
  options: {
    typeAware: true,
    typeCheck: true,
  },
} satisfies OxlintConfig;
