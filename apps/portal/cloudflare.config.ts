import { defineConfig } from "cf/config";

export default defineConfig({
  worker: {
    name: "pms-portal",
    compatibilityDate: "2026-10-08",
    workersDev: false,
    previewUrls: false,
    assets: {
      notFoundHandling: "single-page-application",
    },
    domains: ["app.hotelmanantialchurin.com"],
  },
});
