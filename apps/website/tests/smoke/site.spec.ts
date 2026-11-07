import { expect, test } from "@playwright/test";

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

test("language selector preserves the rooms route", async ({ page }) => {
  await page.goto("/habitaciones/");
  await page.locator("#lang-select").selectOption({ label: "English" });
  await expect(page).toHaveURL(/\/en\/habitaciones\/$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");

  await page.locator("#lang-select").selectOption({ label: "Español" });
  await expect(page).toHaveURL(/\/habitaciones\/$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
});

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

for (const [name, width, trigger] of [
  ["mobile", 390, "[data-gallery-main]"],
  ["desktop", 1280, "[data-gallery-open]"],
] as const) {
  test(`rooms gallery works on ${name}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/habitaciones/");
    const gallery = page.locator("[data-room-gallery]").first();
    const photo = gallery.locator(trigger).first();
    const dialog = gallery.locator("[data-gallery-dialog]");

    await photo.click();
    await expect(dialog).toBeVisible();
    await dialog.locator("[data-gallery-next]").click();
    await expect(dialog.locator("[data-gallery-counter]")).toHaveText(/^2 \/ \d+$/);
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(photo).toBeFocused();
  });
}

test("double room lightbox loads full-size photos on demand", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 844 });
  await page.goto("/habitaciones/");
  const gallery = page.locator("[data-room-gallery]").nth(1);
  const dialog = gallery.locator("[data-gallery-dialog]");
  const slides = dialog.locator("[data-gallery-slide] img");

  await expect(slides.first()).not.toHaveAttribute("src");
  await gallery.locator("[data-gallery-open]").first().click();
  await expect(slides.first()).toHaveAttribute("src", /double-side-view.*\.webp/);
  await expect
    .poll(() => slides.first().evaluate((img) => (img as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  await expect(slides.nth(1)).not.toHaveAttribute("src");

  await dialog.locator("[data-gallery-next]").click();
  await expect(slides.nth(1)).toHaveAttribute("src", /double-top-view.*\.webp/);
  await expect(slides.nth(2)).not.toHaveAttribute("src");
});

for (const path of [
  "/",
  "/en/",
  "/habitaciones/",
  "/en/habitaciones/",
  "/churin/",
  "/en/churin/",
]) {
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

for (const [path, bookingLabel] of [
  ["/churin/", "Consultar disponibilidad"],
  ["/en/churin/", "Check availability"],
] as const) {
  test(`${path} shows the destination and booking action on mobile`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(path);

    await expect(page.locator("[data-churin-hero]")).toBeInViewport({
      ratio: 1,
    });
    await expect(page.locator("[data-churin-intro-booking]")).toBeInViewport({
      ratio: 1,
    });
    await expect(page.locator("[data-churin-intro-booking]")).toHaveText(bookingLabel);
    await expect(page.locator("[data-churin-facts]")).toHaveCSS(
      "grid-template-columns",
      /\d+(?:\.\d+)?px \d+(?:\.\d+)?px/,
    );
  });
}
