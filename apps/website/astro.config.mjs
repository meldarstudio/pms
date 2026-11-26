import { copyFile } from "node:fs/promises";
import { defineConfig, envField, fontProviders } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import svelte from "@astrojs/svelte";
import tailwindcss from "@tailwindcss/vite";
import sitemap from "@astrojs/sitemap";
import { hreflangs } from "./src/i18n/hreflang.ts";
import { roomGalleryImages } from "./build/room-gallery-images.mjs";

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

export default defineConfig({
  adapter: cloudflare({
    imageService: { build: "compile", runtime: "passthrough" },
    prerenderEnvironment: "node",
  }),
  session: false,
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
    plugins: [tailwindcss(), roomGalleryImages()],
  },
  i18n: {
    locales: ["es", "en"],
    defaultLocale: "es",
  },
  integrations: [
    svelte(),
    sitemap({
      customPages: [
        "https://www.hotelmanantialchurin.com/habitaciones/",
        "https://www.hotelmanantialchurin.com/en/habitaciones/",
      ],
      filter: (page) =>
        !/^\/(en\/)?(reservar\/|libro-de-reclamaciones\/)/.test(new URL(page).pathname),
      i18n: {
        defaultLocale: "es",
        locales: hreflangs,
      },
      serialize: (item) => {
        const spanish = item.links?.find(({ lang }) => lang === hreflangs.es);
        return spanish
          ? { ...item, links: [...item.links, { url: spanish.url, lang: "x-default" }] }
          : item;
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
