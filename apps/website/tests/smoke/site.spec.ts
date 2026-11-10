import { expect, test, type Page } from "@playwright/test";
import { daysFromToday, openStay } from "../support/local-api";

async function pickLandingDate(page: Page, name: string, label: string) {
  const [year, month] = label.split("-");
  await page.getByLabel(name).click();
  const popup = page.locator("[data-slot=popover-content]").last();
  await popup.getByLabel("Elegir el año").selectOption(year!);
  await popup.getByLabel("Elegir el mes").selectOption(String(Number(month) - 1));
  await popup.locator(`[data-date="${label}"]`).click();
}

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

for (const [path, availability, guests, adults, sentence, body, prices, rooms, whatsapp] of [
  [
    "/",
    "Consultar disponibilidad",
    "Huéspedes",
    "2 adultos",
    "baño privado",
    "Para una consulta, o una habitación que no se puede reservar en línea, escríbanos.",
    "Ver precios para sus fechas",
    "Ver habitaciones y precios",
    "Escribir por WhatsApp",
  ],
  [
    "/en/",
    "Check availability",
    "Guests",
    "2 adults",
    "private bathroom",
    "For a question, or a room that cannot be booked online, write to us.",
    "See prices for your dates",
    "See rooms and rates",
    "Message us on WhatsApp",
  ],
] as const) {
  test(`${path} landing searches from the hero`, async ({ page }) => {
    await page.goto(path);
    const card = page.locator("#availability");
    const hero = card.locator("xpath=ancestor::section[1]");

    await expect(
      page.getByRole("banner").getByRole("link", { name: availability }),
    ).toHaveAttribute("href", "#availability");
    await expect(card.getByLabel(/llegada|arrival/i)).not.toContainText(/\d/);
    await expect(card.getByLabel(/salida|departure/i)).not.toContainText(/\d/);
    await expect(card.getByRole("button", { name: new RegExp(guests) })).toContainText(adults);
    await expect(card.getByRole("button", { name: availability })).toBeVisible();
    await expect(hero.getByRole("link", { name: rooms })).toHaveCount(0);
    await expect(hero.locator('a[href*="wa.me"]')).toHaveCount(0);
    await expect(hero.getByText(sentence)).toHaveCount(0);
    await expect(page.getByText(sentence)).toBeVisible();
    await expect(page.getByText(body)).toBeVisible();
    await expect(page.getByRole("link", { name: prices })).toHaveCount(0);
    await expect(page.getByRole("link", { name: whatsapp, exact: true })).toBeVisible();
  });
}

for (const [path, label] of [
  ["/habitaciones/", "Reservar por WhatsApp"],
  ["/en/habitaciones/", "Book on WhatsApp"],
] as const) {
  test(`${path} header still opens WhatsApp`, async ({ page }) => {
    await page.goto(path);
    const link = page.getByRole("banner").getByRole("link", { name: label });
    await expect(link).toHaveAttribute("href", /wa\.me/);
    await expect(link).toHaveAttribute("target", "_blank");
  });
}

test("homepage header scrolls to the search card", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.getByRole("banner").getByRole("link", { name: "Consultar disponibilidad" }).click();
  await expect(page).toHaveURL(/#availability$/);
  await expect(page.locator("#availability")).toBeInViewport();
});

test("mobile homepage menu scrolls to the search card", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.locator("#menu-toggle").click();
  await page
    .locator("#mobile-menu")
    .getByRole("link", { name: "Consultar disponibilidad" })
    .click();
  await expect(page).toHaveURL(/#availability$/);
  await expect(page.locator("#availability")).toBeInViewport();
  await expect(page.locator("#menu-toggle")).toHaveAttribute("aria-expanded", "false");
});

test("homepage search keeps an empty stay on the page", async ({ page }) => {
  await page.goto("/");
  await page
    .locator("#availability")
    .getByRole("button", { name: "Consultar disponibilidad" })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("Elija su fecha de llegada.")).toBeVisible();
  await expect(page.getByLabel("Llegada")).toBeFocused();
  await expect(page.getByLabel("Llegada")).toHaveAttribute("aria-invalid", "true");
});

test("homepage search keeps a departure before arrival on the page", async ({ page }) => {
  const day = daysFromToday(40);
  await page.goto("/");
  await pickLandingDate(page, "Salida", day);
  await pickLandingDate(page, "Llegada", day);
  await page
    .locator("#availability")
    .getByRole("button", { name: "Consultar disponibilidad" })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByText("La salida debe ser al menos una noche después de la llegada."),
  ).toBeVisible();
  await expect(page.getByLabel("Salida")).toBeFocused();
});

test("homepage search card opens choose for the chosen stay", async ({ page }) => {
  const stay = openStay();
  await page.goto("/");
  await pickLandingDate(page, "Llegada", stay.checkIn);
  await pickLandingDate(page, "Salida", stay.checkOut);
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
  await expect(page).toHaveURL(new RegExp(`/reservar/habitacion/\\?${params.toString()}$`));
  await expect(page).not.toHaveURL(/room=/);
  await expect(page.getByText(/2 noches · 2 adultos, 1 niño/)).toBeVisible();
});

test("churin band still links to prices", async ({ page }) => {
  await page.goto("/churin/");
  await expect(page.getByRole("link", { name: "Ver precios para sus fechas" })).toHaveAttribute(
    "href",
    /\/reservar\/$/,
  );
});
