import { expect, test } from "@playwright/test";
import { pickRangeDate } from "../support/calendar";
import { openStay } from "../support/local-api";

for (const [path, lang, heading] of [
  ["/", "es", /hotel/i],
  ["/en/", "en", /hotel/i],
  ["/habitaciones/", "es", /habitaciones/i],
  ["/en/habitaciones/", "en", /rooms/i],
] as const) {
  test(`${path} renders in ${lang}`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.ok()).toBe(true);
    await expect(page.locator("html")).toHaveAttribute("lang", lang);
    await expect(page.locator("main h1")).toHaveText(heading);
  });
}

test("mobile menu opens, closes with Escape, and navigates", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const toggle = page.locator("#menu-toggle");
  const menu = page.locator("#mobile-menu");

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(menu).toHaveAttribute("aria-hidden", "false");
  await page.keyboard.press("Escape");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toBeFocused();

  await toggle.click();
  await menu.getByRole("link", { name: "Habitaciones" }).click();
  await expect(page).toHaveURL(/\/habitaciones\/$/);
});

for (const path of ["/", "/en/"]) {
  test(`${path} has a valid booking link`, async ({ page }) => {
    await page.goto(path);
    const link = page.locator('main a[href*="wa.me/"]').first();
    await expect(link).toBeVisible();
    const href = await link.getAttribute("href");
    expect(href).not.toBeNull();
    const url = new URL(href!);
    expect(url.hostname).toBe("wa.me");
    expect(url.pathname).toBe("/51992755015");
    const text = url.searchParams.get("text") ?? "";
    expect(text.trim().length).toBeGreaterThan(0);
    expect(text).toMatch(path.startsWith("/en") ? /Dates:/ : /Fechas:/);
  });
}

test("homepage range picker uses Peru's date, closes today at 11:00 p.m., and displays compact dates", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-11-10T03:00:00Z") });
  await page.goto("/");
  await page.locator("#availability astro-island:not([ssr])").waitFor();
  await expect(page.locator("#stay-check-in")).toHaveText("Elegir llegada");
  await expect(page.locator("#stay-check-out")).toHaveText("Elegir salida");
  await page.locator("#stay-check-in").click();
  const popup = page.getByRole("dialog");
  await expect(popup.locator('[data-date="2026-11-08"]').first()).toBeDisabled();
  await popup.locator('[data-date="2026-11-09"]').first().click();
  await popup.locator('[data-date="2026-11-12"]').first().click();
  await expect(popup).toBeHidden();
  await expect(page.locator("#stay-check-in")).toHaveText("9 nov. 2026");
  await expect(page.locator("#stay-check-out")).toHaveText("12 nov. 2026");
  await page.locator("#stay-check-out").click();
  await expect(popup.locator('[data-date="2026-11-08"]').first()).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(popup).toBeHidden();
  await page.clock.setSystemTime(new Date("2026-11-10T04:01:00Z"));
  await page.locator('#availability button[type="submit"]').click();
  await expect(page.locator("#stay-check-in")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#stay-check-in")).toBeFocused();
  await expect(page).toHaveURL("/");
});

test("homepage search opens the rooms for the chosen stay and keeps it on return", async ({
  page,
}) => {
  const stay = openStay();
  await page.goto("/");
  await page.getByLabel("Llegada").click();
  await pickRangeDate(page, stay.checkIn);
  await pickRangeDate(page, stay.checkOut);
  await page.getByRole("button", { name: /Huéspedes/ }).click();
  await page.getByRole("button", { name: "Aumentar niños" }).click();
  await expect(page.getByRole("button", { name: /Huéspedes/ })).toContainText("2 adultos, 1 niño");
  await page
    .locator("#availability")
    .getByRole("button", { name: "Consultar disponibilidad" })
    .click();

  const params = new URLSearchParams({
    checkIn: stay.checkIn,
    checkOut: stay.checkOut,
    adults: "2",
    children: "1",
  });
  await expect(page).toHaveURL(new RegExp(`/habitaciones/\\?${params.toString()}$`));
  await expect(page.locator("#stay-guests-value")).toHaveText("2 adultos, 1 niño");
  await expect(page.locator('input[name="checkOut"]')).toHaveValue(stay.checkOut);
  await expect(page.getByRole("article", { name: "Suite Matrimonial" })).toBeVisible();

  await page.goBack();
  const form = page.locator("#availability");
  await expect(form.locator('input[name="checkIn"]')).toHaveValue(stay.checkIn);
  await expect(form.locator('input[name="checkOut"]')).toHaveValue(stay.checkOut);
  await expect(form.locator("#stay-guests-value")).toHaveText("2 adultos, 1 niño");
});
