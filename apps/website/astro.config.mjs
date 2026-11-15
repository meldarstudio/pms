import { copyFile } from "node:fs/promises";
import { defineConfig, envField, fontProviders } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import sitemap from "@astrojs/sitemap";

function copyEnglish404() {
  return {
    name: "copy-english-404",
    hooks: {
      "astro:build:done": async ({ dir }) => {
        await copyFile(new URL("./en/404/index.html", dir), new URL("./en/404.html", dir));
      },
    },
  };
}

// https://astro.build/config
export default defineConfig({
  devToolbar: { enabled: false },
  site: "https://www.hotelmanantialchurin.com",
  trailingSlash: "always",
  env: {
    schema: {
      PUBLIC_PMS_API_URL: envField.string({
        context: "client",
        access: "public",
        url: true,
      }),
      PUBLIC_CULQI_PUBLIC_KEY: envField.string({
        context: "client",
        access: "public",
        optional: true,
      }),
      PUBLIC_TURNSTILE_SITE_KEY: envField.string({
        context: "client",
        access: "public",
        optional: true,
      }),
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
  i18n: {
    locales: ["es", "en"],
    defaultLocale: "es",
  },
  integrations: [
    react(),
    sitemap({
      filter: (page) =>
        !/^\/(en\/)?(reservar\/|libro-de-reclamaciones\/)/.test(new URL(page).pathname),
      i18n: {
        defaultLocale: "es",
        locales: {
          es: "es-PE",
          en: "en-US",
        },
      },
    }),
    copyEnglish404(),
  ],
  fonts: [
    {
      provider: fontProviders.fontsource(),
      name: "Lora",
      cssVariable: "--font-lora",
      weights: ["400 700"],
      styles: ["normal"],
      subsets: ["latin"],
    },
    {
      provider: fontProviders.fontsource(),
      name: "Source Sans 3",
      cssVariable: "--font-source-sans-3",
      weights: ["400 700"],
      styles: ["normal"],
      subsets: ["latin"],
    },
  ],
});
