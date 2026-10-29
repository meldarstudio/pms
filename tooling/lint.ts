import { fileURLToPath } from "node:url";
import type { OxlintConfig } from "vite-plus/lint";

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
    {
      name: "pms",
      specifier: fileURLToPath(new URL("./no-comments.mjs", import.meta.url)),
    },
  ],
  rules: {
    "no-undef": "error",
    "vite-plus/prefer-vite-plus-imports": "error",
    "pms/no-comments": "error",
  },
  options: {
    typeAware: true,
    typeCheck: true,
  },
} satisfies OxlintConfig;
