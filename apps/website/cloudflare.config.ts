import { defineConfig } from "cf/config";

export default defineConfig({
  worker: {
    name: "hotelmanantial",
    compatibilityDate: "2026-09-15",
    previewUrls: false,
    assets: {
      notFoundHandling: "404-page",
      runWorkerFirst: [
        "/habitaciones",
        "/habitaciones/*",
        "/en/habitaciones",
        "/en/habitaciones/*",
      ],
    },
  },
});
