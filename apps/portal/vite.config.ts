import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, searchForWorkspaceRoot, lazyPlugins } from "vite-plus";
import { lint } from "../../tooling/lint.ts";

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, import.meta.dirname, "VITE_");
  if (command === "build" && !env.VITE_API_BASE_URL) {
    throw new Error("VITE_API_BASE_URL is required to build the portal.");
  }

  return {
    lint: {
      ...lint,
      plugins: [...lint.plugins, "react"],
      rules: {
        ...lint.rules,
        "react/exhaustive-deps": "warn",
      },
      overrides: [
        { files: ["src/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}"], env: { browser: true } },
        { files: ["*.config.ts", "tests/**/*.{ts,tsx}"], env: { node: true } },
      ],
      ignorePatterns: ["public/**", "dist/**", "coverage/**", ".wrangler/**", "**/.pnpm-store/**"],
    },
    define: {
      "import.meta.env.VITE_PWA_BUILD_ID": JSON.stringify(Date.now().toString()),
    },
    test: {
      name: "portal",
      environment: "node",
      include: ["tests/*.test.ts"],
      // Also bound package-local runs, which do not load the root test config.
      fileParallelism: false,
      pool: "forks",
      execArgv: ["--max-old-space-size=1536"],
    },
    plugins: lazyPlugins(() => [react(), tailwindcss()]),
    resolve: {
      alias: {
        "@": resolve(import.meta.dirname, "./src"),
      },
    },
    server: {
      fs: {
        allow: [searchForWorkspaceRoot(import.meta.dirname)],
      },
    },
  };
});
