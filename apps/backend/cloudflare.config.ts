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
      COMPLAINT_ATTACHMENTS: bindings.r2({
        name: "pms-complaint-files",
        dev: { remote: false },
      }),
      ALLOWED_ORIGINS: bindings.text("https://app.hotelmanantialchurin.com"),
      PUBLIC_ALLOWED_ORIGINS: bindings.text("https://www.hotelmanantialchurin.com"),
      PUBLISHED_ROOM_TYPE_IDS: bindings.text(
        "935c7f23-8acc-4c78-b456-9bc588cccc2d,a50f22a2-c02c-4cb1-ab98-e9da48f0228d,e93f440e-5546-45b3-8969-68a871d4ae81",
      ),
      DB: bindings.d1({
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
