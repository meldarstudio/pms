import { expect, test } from "@playwright/test";
import { addDays } from "../../src/lib/reservation/search.ts";
import { pickRangeDate } from "../support/calendar";
import { openStay } from "../support/local-api";

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
  await page.getByRole("button", { name: /Habitaciones y huéspedes/ }).click();
  await page.getByRole("button", { name: "Aumentar niños" }).click();
  await expect(page.getByRole("button", { name: /Habitaciones y huéspedes/ })).toContainText(
    "1 habitación, 2 huéspedes",
  );
  await page
    .locator("#availability")
    .getByRole("button", { name: "Consultar disponibilidad" })
    .click();

  const params = new URLSearchParams({
    checkIn: stay.checkIn,
    checkOut: stay.checkOut,
    adults: "1",
    children: "1",
  });
  await expect(page).toHaveURL(new RegExp(`/habitaciones/\\?${params.toString()}$`));
  await expect(page.locator("#stay-guests-value")).toHaveText("1 habitación, 2 huéspedes");
  await expect(page.locator("#stay-check-out time")).toHaveAttribute("datetime", stay.checkOut);
  await expect(page.getByRole("article", { name: "Suite Matrimonial" })).toBeVisible();

  await page.goBack();
  const form = page.locator("#availability");
  await expect(form.locator("#stay-check-in time")).toHaveAttribute("datetime", stay.checkIn);
  await expect(form.locator("#stay-check-out time")).toHaveAttribute("datetime", stay.checkOut);
  await expect(form.locator("#stay-guests-value")).toHaveText("1 habitación, 2 huéspedes");
});
