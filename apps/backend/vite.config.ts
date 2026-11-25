import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { cloudflare } from "@cloudflare/vite-plugin";
import { bindings } from "cf/config";
import { defineConfig, loadEnv } from "vite-plus";
import { lint } from "../../tooling/lint";

const localApiDir = process.env.PMS_LOCAL_API_DIR;
const localBindingNames = [
  "SESSION_SECRET",
  "CURRENCY",
  "PROPERTY_TIME_ZONE",
  "ALLOWED_ORIGINS",
  "PUBLIC_ALLOWED_ORIGINS",
  "PUBLISHED_ROOM_TYPE_IDS",
  "CULQI_SECRET_KEY",
  "CULQI_API_URL",
  "TURNSTILE_SECRET_KEY",
  "TURNSTILE_VERIFY_URL",
  "RESEND_API_KEY",
  "RESEND_API_URL",
  "WEB_PUSH_PUBLIC_KEY",
  "WEB_PUSH_PRIVATE_KEY",
];

function localBindingOverrides(mode: string) {
  const envDir = localApiDir ?? process.cwd();
  const varsFile = [`.dev.vars.${mode}`, ".dev.vars"]
    .map((name) => join(envDir, name))
    .find(existsSync);
  const values = varsFile
    ? parseEnv(readFileSync(varsFile, "utf8"))
    : loadEnv(mode, envDir, localBindingNames);
  return Object.fromEntries(
    localBindingNames.flatMap((name) => {
      const value = values[name];
      return value === undefined ? [] : [[name, bindings.text(value)]];
    }),
  );
}

export default defineConfig(({ command, mode }) => ({
  plugins: process.env.VITEST
    ? []
    : cloudflare({
        remoteBindings: false,
        persistState: localApiDir ? { path: join(localApiDir, "state") } : true,
        config: (config) =>
          command === "serve"
            ? {
                ...config,
                worker: {
                  ...config.worker,
                  env: { ...config.worker.env, ...localBindingOverrides(mode) },
                },
              }
            : config,
      }),
  envDir: localApiDir,
  publicDir: false,
  server: { port: 8788, strictPort: true, cors: false },
  environments: { ssr: { build: { minify: true } } },
  lint: {
    ...lint,
    overrides: [
      { files: ["src/**/*.{ts,tsx}"], env: { serviceworker: true } },
      {
        files: ["*.config.ts", "scripts/**/*.mjs", "src/**/*.test.{ts,mjs}"],
        env: { node: true },
      },
    ],
    ignorePatterns: ["drizzle/**", "dist/**", "coverage/**", ".cloudflare/**", "**/.pnpm-store/**"],
  },
  test: {
    name: "backend",
    environment: "node",
    include: ["src/**/*.test.{ts,mjs}"],
  },
}));
