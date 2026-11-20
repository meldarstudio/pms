import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";
import website from "./astro.config.mjs";

const variant = process.env.LANDING_PROTOTYPE ?? "react";
if (!["react", "vue", "svelte"].includes(variant)) {
  throw new Error(`Unknown landing prototype: ${variant}`);
}

const renderer =
  variant === "vue"
    ? (await import("@astrojs/vue")).default()
    : variant === "svelte"
      ? (await import("@astrojs/svelte")).default()
      : null;

export default defineConfig({
  ...website,
  outDir: `./.landing-prototype/${variant}`,
  integrations: [...(website.integrations ?? []), ...(renderer ? [renderer] : [])],
  vite: {
    ...website.vite,
    resolve: {
      alias: renderer
        ? {
            "@/components/StaySearch.astro": fileURLToPath(
              new URL(`./src/components/landing-prototype/${variant}.astro`, import.meta.url),
            ),
          }
        : {},
    },
  },
});
