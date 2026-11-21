import { expect, test, type Locator } from "@playwright/test";
import { addDays } from "../../src/lib/reservation/search.ts";
import { pickRangeDate } from "../support/calendar";
import { daysFromToday, openStay } from "../support/local-api";

const dayLook = (day: Locator) =>
  day.evaluate((element) => {
    const style = getComputedStyle(element);
    return { color: style.color, background: style.backgroundColor, opacity: style.opacity };
  });

test("the desktop date calendar opens at the width of its months, aligned to its field", async ({
  page,
}) => {
  await page.goto("/");
  const field = page.locator("#stay-check-in");
  await field.click();
  const calendar = page.getByRole("dialog");
  await expect(calendar.locator("table")).toHaveCount(2);

  const [popup, months, trigger] = await Promise.all([
    calendar.boundingBox(),
    calendar.locator(".lp-months").boundingBox(),
    field.boundingBox(),
  ]);
  expect(popup!.width).toBeLessThan(months!.width + 64);
  expect(Math.abs(popup!.x - trigger!.x)).toBeLessThan(1);
});

test("the chosen arrival stays highlighted, not greyed out, while choosing the departure", async ({
  page,
}) => {
  const first = daysFromToday(120);
  const arrival = first.endsWith("-01") ? daysFromToday(121) : first;
  await page.goto("/");
  await page.getByLabel("Llegada").click();
  await pickRangeDate(page, arrival);

  const calendar = page.getByRole("dialog");
  const arrivalDay = calendar.locator(`[data-date="${arrival}"]`).first();
  const dayBefore = calendar.locator(`[data-date="${addDays(arrival, -1)}"]`).first();
  await expect(dayBefore).toHaveAttribute("aria-disabled", "true");
  await expect(arrivalDay).toHaveAttribute("data-stay-range", "edge");
  await expect(arrivalDay).toHaveCSS("opacity", "1");
  const [arrivalLook, unavailableLook] = await Promise.all([
    dayLook(arrivalDay),
    dayLook(dayBefore),
  ]);
  expect(arrivalLook.color).not.toBe(unavailableLook.color);
  expect(arrivalLook.background).not.toBe(unavailableLook.background);
});

test("every room photo fills its carousel and has its own dot", async ({ page }) => {
  await page.goto("/habitaciones/");
  await expect(page.locator("fieldset.lp-fields:not([disabled])")).toBeVisible();
  const carousels = page.locator('[data-slot="carousel"]');
  await expect(carousels.first()).toBeVisible();

  for (const carousel of await carousels.all()) {
    const slides = carousel.locator('[data-slot="carousel-item"]');
    const width = (await carousel.locator('[data-slot="carousel-viewport"]').boundingBox())!.width;
    for (const slide of await slides.all()) {
      expect(Math.round((await slide.boundingBox())!.width)).toBe(Math.round(width));
    }
    await expect(carousel.locator('[data-slot="carousel-indicator"]:visible')).toHaveCount(
      await slides.count(),
    );
  }
});

test("on phones, room details and guests open as bottom sheets", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/habitaciones/");
  await expect(page.locator("fieldset.lp-fields:not([disabled])")).toBeVisible();

  await page.getByRole("button", { name: /Huéspedes/ }).click();
  const guests = page.getByRole("dialog");
  await expect(guests).toHaveAttribute("data-presentation", "sheet");
  await guests.getByRole("button", { name: "Cerrar huéspedes" }).click();
  await expect(guests).toBeHidden();

  await page.getByRole("button", { name: "Detalles de la habitación" }).first().click();
  const details = page.getByRole("dialog");
  await expect(details).toHaveAttribute("data-presentation", "sheet");
});

test("on desktop, room details open centred and guests as a popover", async ({ page }) => {
  await page.goto("/habitaciones/");
  await expect(page.locator("fieldset.lp-fields:not([disabled])")).toBeVisible();

  await page.getByRole("button", { name: /Huéspedes/ }).click();
  const guests = page.getByRole("dialog");
  await expect(guests).toHaveAttribute("data-presentation", "popover");
  await page.keyboard.press("Escape");
  await expect(guests).toBeHidden();

  await page.getByRole("button", { name: "Detalles de la habitación" }).first().click();
  const details = page.getByRole("dialog");
  await expect(details).toHaveAttribute("data-presentation", "dialog");
  const viewport = page.viewportSize()!;
  await expect
    .poll(async () => {
      const box = (await details.boundingBox())!;
      return [
        Math.round(box.x + box.width / 2 - viewport.width / 2),
        Math.round(box.y + box.height / 2 - viewport.height / 2),
      ];
    })
    .toEqual([0, 0]);
});

test("homepage search opens the rooms for the chosen stay and keeps it on return", async ({
  page,
}) => {
  const stay = openStay();
  await page.goto("/");
  const arrival = page.getByLabel("Llegada");
  await arrival.click();
  await pickRangeDate(page, addDays(stay.checkIn, -1));
  await pickRangeDate(page, stay.checkOut);
  await arrival.click();
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
