import { bindings, defineConfig, triggers } from "cf/config";

export default defineConfig({
  worker: {
    name: "pms-api",
    compatibilityDate: "2026-10-08",
    compatibilityFlags: ["nodejs_compat"],
    entrypoint: "src/index.ts",
    workersDev: false,
    previewUrls: false,
    observability: {
      logs: {
        enabled: true,
        invocationLogs: true,
      },
    },
    domains: ["api.hotelmanantialchurin.com"],
    triggers: [
      triggers.scheduled({
        schedule: "* * * * *",
      }),
    ],
    env: {
      CURRENCY: bindings.text("PEN"),
      PROPERTY_TIME_ZONE: bindings.text("America/Lima"),
      ALLOWED_ORIGINS: bindings.text("https://app.hotelmanantialchurin.com"),
      DB: bindings.d1({
        name: "pms-production",
        id: "17e838dd-b2f9-4783-ad9b-f5d837701428",
      }),
      LOGIN_LIMITER: bindings.rateLimit({
        namespace: "1001",
        simple: {
          limit: 5,
          period: 60,
        },
      }),
    },
  },
});
