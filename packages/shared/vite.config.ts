import { defineConfig } from "vite-plus";
import { lint } from "../../tooling/lint";

export default defineConfig({
  lint: {
    ...lint,
    overrides: [{ files: ["*.config.ts"], env: { node: true } }],
    ignorePatterns: ["dist/**", "coverage/**", "**/.pnpm-store/**"],
  },
});
