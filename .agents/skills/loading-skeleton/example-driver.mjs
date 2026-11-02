// Worked example: the new-reservation summary card (apps/portal creation-summary.tsx).
// Copy this and measure.mjs into the scratch directory, then edit the marked parts.
// Usage: node driver.mjs [WIDTHxHEIGHT] [screenshot-prefix]
import { chromium } from "playwright-core";
import { boxes, compare } from "./measure.mjs";

const [width, height] = (process.argv[2] ?? "1440x900").split("x").map(Number);
const shot = process.argv[3];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium" });
const page = await browser.newPage({ viewport: { width, height } });

await page.goto("http://localhost:5173");
await page.getByLabel("Usuario").fill(process.env.PMS_USER);
await page.getByLabel("Contraseña", { exact: true }).fill(process.env.PMS_PASSWORD);
await page.getByRole("button", { name: "Iniciar sesión" }).click();

// EDIT: the region to measure, and the steps that make it fetch.
const region = 'section:has(h3:text-is("Resumen de reserva"))';
const reach = async () => {
  await page.getByRole("button", { name: "Nueva reserva", exact: true }).first().click();
  await page.locator(region).waitFor();
  await page.getByRole("combobox", { name: "Tipo" }).first().click();
  await page.getByRole("option").first().click();
};
// EDIT: text that only appears once the read has landed.
const loadedSignal = /Pago inicial requerido/;
// EDIT: the read the skeleton stands in for.
const read = "**/reservations/preview";

await reach();
await page.getByText(loadedSignal).waitFor();
const loaded = await boxes(page, region);
if (shot) await page.locator(region).screenshot({ path: `${shot}-loaded.png` });

let release;
const gate = new Promise((resolve) => (release = resolve));
await page.route(read, async (route) => {
  await gate;
  await route.continue();
});
await page.reload();
await reach();
await page.waitForTimeout(800);
const delayed = await boxes(page, region);
if (shot) await page.locator(region).screenshot({ path: `${shot}-delayed.png` });
release();

compare(loaded, delayed);
await browser.close();
