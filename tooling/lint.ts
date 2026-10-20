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
  ],
  rules: {
    "no-undef": "error",
    "vite-plus/prefer-vite-plus-imports": "error",
  },
  options: {
    typeAware: true,
    typeCheck: true,
  },
} satisfies OxlintConfig;
