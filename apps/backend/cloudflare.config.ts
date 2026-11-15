import { bindings, defineConfig, triggers } from "cf/config";

const paymentReconciliationBackstop = "* * * * *";

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
        schedule: paymentReconciliationBackstop,
      }),
    ],
    env: {
      CURRENCY: bindings.text("PEN"),
      PROPERTY_TIME_ZONE: bindings.text("America/Lima"),
      COMPLAINT_BOOK: bindings.text("production"),
      COMPLAINT_ATTACHMENTS: bindings.r2({
        name: "pms-complaint-files",
        dev: { remote: false },
      }),
      ALLOWED_ORIGINS: bindings.text("https://app.hotelmanantialchurin.com"),
      PUBLIC_ALLOWED_ORIGINS: bindings.text("https://www.hotelmanantialchurin.com"),
      PUBLISHED_ROOM_TYPE_IDS: bindings.text(
        "type-suite-matrimonial,type-doble-premium,type-suite-familiar",
      ),
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
      SEARCH_LIMITER: bindings.rateLimit({
        namespace: "1002",
        simple: {
          limit: 60,
          period: 60,
        },
      }),
      QUOTE_LIMITER: bindings.rateLimit({
        namespace: "1003",
        simple: {
          limit: 10,
          period: 60,
        },
      }),
      PAYMENT_IP_LIMITER: bindings.rateLimit({
        namespace: "1004",
        simple: {
          limit: 5,
          period: 60,
        },
      }),
      PAYMENT_CHECKOUT_LIMITER: bindings.rateLimit({
        namespace: "1005",
        simple: {
          limit: 5,
          period: 60,
        },
      }),
    },
  },
});
