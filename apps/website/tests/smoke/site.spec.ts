import { expect, test } from "@playwright/test";
import { pickRangeDate } from "../support/calendar";
import { daysFromToday, openStay } from "../support/local-api";

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

for (const width of [390, 1280]) {
  test(`room photos swipe inline and open a lightbox at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/habitaciones/");
    const gallery = page.getByRole("region", { name: "Fotos de Doble Premium" });
    await gallery.hover();
    await gallery.getByRole("button", { name: "Foto siguiente" }).click();
    const second = gallery.getByRole("button", { name: "Doble Premium: Abrir foto 2 de 3" });
    await expect(second).toBeInViewport();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await second.click();
    const lightbox = page.getByRole("dialog", { name: "Doble Premium" });
    await expect(lightbox.getByRole("button", { name: "Cerrar" })).toBeFocused();
    await expect(lightbox).toContainText(/Doble Premium: .+, 2 de 3$/);
    const photo = lightbox.getByRole("img", { name: /área de descanso/ });
    await expect(photo).toHaveAttribute("src", /double-top-view.*\.webp/);
    await expect
      .poll(() => photo.evaluate((img) => (img as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
    await page.keyboard.press("ArrowRight");
    await expect(lightbox).toContainText(/, 3 de 3$/);
    await page.keyboard.press("Escape");
    await expect(lightbox).toBeHidden();
    await expect(
      gallery.getByRole("button", { name: "Doble Premium: Abrir foto 3 de 3" }),
    ).toBeFocused();
  });
}

test("room lightbox closes from outside the photo", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 844 });
  await page.goto("/habitaciones/");
  await page.getByRole("button", { name: "Suite Familiar: Abrir foto 1 de 3" }).click();
  const lightbox = page.getByRole("dialog", { name: "Suite Familiar" });
  await expect(lightbox).toBeVisible();
  await page.mouse.click(640, 30);
  await expect(lightbox).toBeHidden();
});

for (const path of ["/", "/en/", "/churin/", "/en/churin/"]) {
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

for (const [path, availability, guests, adults, body, prices, rooms, whatsapp] of [
  [
    "/",
    "Consultar disponibilidad",
    "Huéspedes",
    "2 adultos",
    "Consulte disponibilidad y precios para sus fechas.",
    "Ver precios para sus fechas",
    "Ver habitaciones y precios",
    "Escribir por WhatsApp",
  ],
  [
    "/en/",
    "Check availability",
    "Guests",
    "2 adults",
    "Check availability and prices for your dates.",
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
      page
        .getByRole("banner")
        .getByRole("link", { name: path === "/" ? "Reservar" : "Book now", exact: true }),
    ).toHaveAttribute("href", "#availability");
    await expect(card.getByLabel(/llegada|arrival/i)).not.toContainText(/\d/);
    await expect(card.getByLabel(/salida|departure/i)).not.toContainText(/\d/);
    await expect(card.getByRole("button", { name: new RegExp(guests) })).toContainText(adults);
    await expect(card.getByRole("button", { name: availability })).toBeVisible();
    await expect(hero.getByRole("link", { name: rooms })).toHaveCount(0);
    await expect(hero.locator('a[href*="wa.me"]')).toHaveCount(0);
    await expect(page.getByText(body)).toBeVisible();
    await expect(page.getByRole("link", { name: prices })).toHaveCount(0);
    await expect(page.getByRole("link", { name: whatsapp, exact: true })).toBeVisible();
  });
}

for (const [path, label] of [
  ["/habitaciones/", "Reservar"],
  ["/en/habitaciones/", "Book now"],
] as const) {
  test(`${path} header scrolls to the stay search`, async ({ page }) => {
    await page.goto(path);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const link = page.getByRole("banner").getByRole("link", { name: label, exact: true });
    await expect(link).toHaveAttribute("href", "#availability");
    await link.click();
    await expect(page.locator("#availability")).toBeInViewport();
    await expect(page.locator("#stay-check-in")).toBeFocused();
  });
}

test("homepage header scrolls to the search card", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.getByRole("banner").getByRole("link", { name: "Reservar", exact: true }).click();
  await expect(page).toHaveURL(/#availability$/);
  await expect(page.locator("#availability")).toBeInViewport();
  await expect(page.getByLabel("Llegada", { exact: false })).toBeFocused();
});

test("mobile header keeps booking beside the menu and closes the menu on booking", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const banner = page.getByRole("banner");
  const toggle = page.locator("#menu-toggle");
  const home = banner.getByRole("link", { name: "Hotel Manantial", exact: true });
  const book = banner.getByRole("link", { name: "Reservar", exact: true });
  const [toggleBox, homeBox, bookBox] = await Promise.all(
    [toggle, home, book].map((item) => item.boundingBox()),
  );
  expect(toggleBox!.x).toBeLessThan(homeBox!.x);
  expect(homeBox!.x + homeBox!.width).toBeLessThan(bookBox!.x);
  expect(Math.abs(homeBox!.x + homeBox!.width / 2 - 195)).toBeLessThan(2);
  await expect(page.locator("#mobile-menu").getByRole("link", { name: "Reservar" })).toHaveCount(0);

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await toggle.click();
  await book.click();
  await expect(page).toHaveURL(/#availability$/);
  await expect(page.locator("#availability")).toBeInViewport();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
});

for (const [path, label] of [
  ["/", "Consultar disponibilidad"],
  ["/en/", "Check availability"],
] as const) {
  test(`${path} bottom booking action returns to the existing stay`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(path);
    await page.locator("#availability astro-island:not([ssr])").waitFor();
    await page.locator("#stay-check-in").click();
    const popup = page.getByRole("dialog");
    await popup.locator("button[data-date]:not([disabled])").first().click();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await expect(popup).toBeHidden();
    const arrival = await page.locator('#availability input[name="checkIn"]').inputValue();
    const departure = await page.locator('#availability input[name="checkOut"]').inputValue();
    const bottomAction = page.getByRole("link", { name: label, exact: true });
    await expect(bottomAction).toHaveAttribute("href", "#availability");
    await bottomAction.click();
    await expect(page).toHaveURL(/#availability$/);
    await expect(page.locator("#availability")).toBeInViewport();
    await expect(page.locator("#stay-check-in")).toBeFocused();
    await expect(page.locator('#availability input[name="checkIn"]')).toHaveValue(arrival);
    await expect(page.locator('#availability input[name="checkOut"]')).toHaveValue(departure);
  });
}

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

for (const [path, arrivalPlaceholder, departurePlaceholder, arrival, departure] of [
  ["/", "Elegir llegada", "Elegir salida", "10 nov. 2026", "12 nov. 2026"],
  ["/en/", "Choose arrival", "Choose departure", "Nov 10, 2026", "Nov 12, 2026"],
] as const) {
  test(`${path} range picker uses Peru's date and displays compact dates`, async ({ page }) => {
    await page.clock.install({ time: new Date("2026-11-10T03:00:00Z") });
    await page.goto(path);
    await page.locator("#availability astro-island:not([ssr])").waitFor();
    await expect(page.locator("#stay-check-in")).toHaveText(arrivalPlaceholder);
    await expect(page.locator("#stay-check-out")).toHaveText(departurePlaceholder);
    await page.locator("#stay-check-in").click();
    const popup = page.getByRole("dialog");
    await expect(popup.locator('[data-date="2026-11-08"]').first()).toBeDisabled();
    await expect(popup.locator('[data-date="2026-11-09"]').first()).toBeDisabled();
    await popup.locator('[data-date="2026-11-10"]').first().click();
    await popup.locator('[data-date="2026-11-12"]').first().click();
    await expect(popup).toBeHidden();
    await expect(page.locator("#stay-check-in")).toHaveText(arrival);
    await expect(page.locator("#stay-check-out")).toHaveText(departure);
    await page.locator("#stay-check-out").click();
    await expect(popup.locator('[data-date="2026-11-09"]').first()).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(popup).toBeHidden();
    await page.clock.setSystemTime(new Date("2026-11-10T05:01:00Z"));
    await page.locator('#availability button[type="submit"]').click();
    await expect(page.locator("#stay-check-in")).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#stay-check-in")).toBeFocused();
    await expect(page).toHaveURL(path);
  });
}

test("homepage range picker requires a departure after arrival", async ({ page }) => {
  const day = daysFromToday(40);
  await page.goto("/");
  const form = page.locator("#availability");
  await form.getByLabel("Salida").click();
  const popup = page.locator("[data-slot=popover-content]").last();
  await expect(popup.getByRole("heading")).toHaveText("Elija su fecha de llegada");
  await pickRangeDate(page, day);
  await expect(popup.getByRole("heading")).toHaveText("Elija su fecha de salida");
  await popup.locator(`[data-date="${day}"]`).first().click();
  await expect(popup.getByRole("heading")).toHaveText("Elija su fecha de salida");
  await page.keyboard.press("Escape");
  await expect(form.getByLabel("Salida")).toBeFocused();
  await page
    .locator("#availability")
    .getByRole("button", { name: "Consultar disponibilidad" })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("Elija su fecha de salida.")).toBeVisible();
  await expect(form.getByLabel("Salida")).toBeFocused();
});

test("mobile calendar drawer keeps the arrival when dismissed and restores focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/");
  const form = page.locator("#availability");
  await form.getByLabel("Llegada").click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toHaveAccessibleName("Elija su fecha de llegada");
  await pickRangeDate(page, daysFromToday(40));
  await expect(drawer).toHaveAccessibleName("Elija su fecha de salida");
  await drawer.getByRole("button", { name: "Cerrar calendario" }).click();
  await expect(drawer).toBeHidden();
  await expect(form.getByLabel("Llegada")).toBeFocused();
  await expect(page.locator('#availability input[name="checkIn"]')).toHaveValue(daysFromToday(40));

  await form.getByLabel("Salida").click();
  await expect(drawer).toHaveAccessibleName("Elija su fecha de salida");
  await pickRangeDate(page, daysFromToday(42));
  await expect(drawer).toBeHidden();
  await expect(form.getByLabel("Salida")).toBeFocused();
  await expect(page.locator('#availability input[name="checkOut"]')).toHaveValue(daysFromToday(42));

  await form.getByLabel("Salida").click();
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(form.getByLabel("Salida")).toBeFocused();
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

for (const width of [390, 1280]) {
  test(`homepage range picker supports keyboard selection at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    const form = page.locator("#availability");
    await form.getByLabel("Llegada").click();
    const popup = page.getByRole("dialog");
    await expect(popup.getByRole("grid")).toHaveCount(width < 768 ? 1 : 2);

    await pickRangeDate(page, daysFromToday(40));
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await expect(popup).toBeHidden();
    await expect(form.locator('input[name="checkIn"]')).toHaveValue(daysFromToday(40));
    await expect(form.locator('input[name="checkOut"]')).toHaveValue(daysFromToday(41));

    await form.getByLabel("Salida").click();
    const tooLate = daysFromToday(101);
    const [year, month] = tooLate.split("-");
    await popup.getByLabel("Elegir el año").first().selectOption(year!);
    await popup
      .getByLabel("Elegir el mes")
      .first()
      .selectOption(String(Number(month) - 1));
    await expect(popup.locator(`[data-date="${tooLate}"]`).first()).toBeDisabled();
    await pickRangeDate(page, daysFromToday(100));
    await expect(form.locator('input[name="checkIn"]')).toHaveValue(daysFromToday(40));
    await expect(form.locator('input[name="checkOut"]')).toHaveValue(daysFromToday(100));
  });
}

test("churin band still links to prices", async ({ page }) => {
  await page.goto("/churin/");
  await expect(page.getByRole("link", { name: "Ver precios para sus fechas" })).toHaveAttribute(
    "href",
    /\/habitaciones\/$/,
  );
});
